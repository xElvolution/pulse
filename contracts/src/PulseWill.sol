// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title PulseWill: a multi-beneficiary dead man's switch.
/// @notice You fund a will and name the people you want to leave it to, each with
///         their own allocation. The will is a programmable holder you control like
///         a wallet: deposit and withdraw freely while you're alive, and every action
///         resets your inactivity clock. Go silent past your chosen interval and each
///         beneficiary can claim their allocation from the pool - nothing moves before
///         then, and you can always pull your funds back out while active.
/// @dev    Claims draw from one shared pool capped at each beneficiary's allocation.
///         Set every allocation to the full balance for first-come-first-served;
///         split the balance across allocations to ration it. One mechanism, both modes.
contract PulseWill {
    struct Beneficiary {
        address wallet;      // who may claim; address(0) => email-verified claim via the verifier
        uint256 allocation;  // max this beneficiary can pull from the pool
        uint256 claimed;     // amount already pulled
        string name;         // display name, e.g. "Maxwell"
        string email;        // contact: reminders, and identity for email-verified claims
    }

    struct Will {
        address owner;
        address token;       // address(0) = native MON
        uint256 balance;     // pooled funds currently held
        uint64 interval;     // seconds of allowed inactivity
        uint64 lastActive;   // timestamp of the owner's most recent action
        uint32 beats;        // lifetime activity count, for the UI
        bool closed;         // owner withdrew everything / wound it down
        string note;         // message revealed to beneficiaries on flatline
        string ownerEmail;   // where "are you still there?" reminders go (optional)
    }

    uint64 public constant MIN_INTERVAL = 15 seconds;
    uint64 public constant MAX_INTERVAL = 365 days;
    uint256 public constant MAX_BENEFICIARIES = 20;

    /// @notice Service that performs email OTP verification for wallet-less heirs.
    ///         It can only direct an ALREADY-UNLOCKED email-heir share to a recipient;
    ///         it cannot touch wallet-based heirs, live wills, or change allocations.
    ///         Rotatable by the guardian so email heirs are never stranded if the
    ///         verifier key is lost or compromised.
    address public verifier;

    /// @notice May rotate the verifier and nothing else. Cannot touch funds,
    ///         wills, or claim logic.
    address public immutable guardian;

    uint256 public nextWillId;
    mapping(uint256 => Will) public wills;
    mapping(uint256 => Beneficiary[]) private _beneficiaries;
    mapping(address => uint256[]) private _willsByOwner;
    mapping(address => uint256[]) private _willsByBeneficiary;

    event WillCreated(uint256 indexed id, address indexed owner, address token, uint256 amount, uint64 interval);
    event Heartbeat(uint256 indexed id, uint64 timestamp, uint32 beats);
    event Deposited(uint256 indexed id, uint256 amount, uint256 newBalance);
    event Withdrawn(uint256 indexed id, uint256 amount, uint256 newBalance);
    event Claimed(uint256 indexed id, uint256 indexed index, address indexed to, uint256 amount);
    event Closed(uint256 indexed id, uint256 refunded);
    event VerifierChanged(address verifier);

    error NotOwner();
    error StillAlive();
    error Gone();
    error BadInterval();
    error BadBeneficiary();
    error BadAmount();
    error NotVerifier();
    error BadIndex();
    error NothingToClaim();
    error TransferFailed();

    constructor(address _verifier) {
        verifier = _verifier;
        guardian = msg.sender;
    }

    /// @notice Rotate the verifier service key. Guardian-only.
    function setVerifier(address _verifier) external {
        if (msg.sender != guardian) revert NotVerifier();
        verifier = _verifier;
        emit VerifierChanged(_verifier);
    }

    // ---- inputs ----

    struct BeneficiaryInput {
        address wallet;
        uint256 allocation;
        string name;
        string email;
    }

    /// @notice Create and fund a will. For native MON send value == amount;
    ///         for an ERC20, approve this contract for `amount` first.
    /// @param people The beneficiaries and their allocations. Each needs a wallet
    ///        address or an email (for verified email claims). Allocations may sum to
    ///        more than `amount` (first-come-first-served) or exactly `amount`
    ///        (rationed) - your choice.
    function createWill(
        address token,
        uint256 amount,
        uint64 interval,
        string calldata note,
        string calldata ownerEmail,
        BeneficiaryInput[] calldata people
    ) external payable returns (uint256 id) {
        if (interval < MIN_INTERVAL || interval > MAX_INTERVAL) revert BadInterval();
        if (people.length == 0 || people.length > MAX_BENEFICIARIES) revert BadBeneficiary();

        if (token == address(0)) {
            if (msg.value == 0 || msg.value != amount) revert BadAmount();
        } else {
            if (msg.value != 0 || amount == 0) revert BadAmount();
            _pull(token, msg.sender, amount);
        }

        id = nextWillId++;
        Will storage w = wills[id];
        w.owner = msg.sender;
        w.token = token;
        w.balance = amount;
        w.interval = interval;
        w.lastActive = uint64(block.timestamp);
        w.beats = 1;
        w.note = note;
        w.ownerEmail = ownerEmail;

        for (uint256 i = 0; i < people.length; i++) {
            BeneficiaryInput calldata p = people[i];
            if (p.allocation == 0) revert BadAmount();
            if (p.wallet == msg.sender) revert BadBeneficiary();
            // wallet-less heirs claim via email verification, so an email is required
            if (p.wallet == address(0) && bytes(p.email).length == 0) revert BadBeneficiary();

            _beneficiaries[id].push(Beneficiary({
                wallet: p.wallet,
                allocation: p.allocation,
                claimed: 0,
                name: p.name,
                email: p.email
            }));
            if (p.wallet != address(0)) _willsByBeneficiary[p.wallet].push(id);
        }

        _willsByOwner[msg.sender].push(id);
        emit WillCreated(id, msg.sender, token, amount, interval);
        emit Heartbeat(id, uint64(block.timestamp), 1);
    }

    // ---- owner actions (each resets the inactivity clock) ----

    /// @notice Check in. Resets your inactivity countdown. This is the "I'm still here" click.
    function beat(uint256 id) public {
        Will storage w = _ownedActive(id);
        _touch(id, w);
    }

    /// @notice Check in on every will you own in one transaction.
    function beatAll() external {
        uint256[] storage ids = _willsByOwner[msg.sender];
        for (uint256 i = 0; i < ids.length; i++) {
            Will storage w = wills[ids[i]];
            if (w.closed || w.owner != msg.sender) continue;
            _touch(ids[i], w);
        }
    }

    /// @notice Add funds to the pool. Also counts as activity.
    function deposit(uint256 id, uint256 amount) external payable {
        Will storage w = _ownedActive(id);
        if (w.token == address(0)) {
            if (msg.value == 0 || msg.value != amount) revert BadAmount();
        } else {
            if (msg.value != 0 || amount == 0) revert BadAmount();
            _pull(w.token, msg.sender, amount);
        }
        w.balance += amount;
        emit Deposited(id, amount, w.balance);
        _touch(id, w);
    }

    /// @notice Pull funds back out while you're alive. This is why it feels like your
    ///         own wallet: the money is yours until a beneficiary actually claims it.
    function withdraw(uint256 id, uint256 amount) external {
        Will storage w = _ownedActive(id);
        if (amount == 0 || amount > w.balance) revert BadAmount();
        w.balance -= amount;
        emit Withdrawn(id, amount, w.balance);
        _touch(id, w);
        _payout(w.token, msg.sender, amount);
    }

    /// @notice Wind the will down and refund everything still pooled.
    function close(uint256 id) external {
        Will storage w = _ownedActive(id);
        uint256 amount = w.balance;
        w.balance = 0;
        w.closed = true;
        emit Closed(id, amount);
        if (amount > 0) _payout(w.token, msg.sender, amount);
    }

    // ---- beneficiary claims (only after the inactivity window lapses) ----

    /// @notice A named beneficiary claims their remaining allocation from the pool.
    function claim(uint256 id, uint256 index) external {
        Beneficiary storage b = _beneficiaryAt(id, index);
        if (b.wallet == address(0) || b.wallet != msg.sender) revert BadBeneficiary();
        _claim(id, index, b, msg.sender);
    }

    /// @notice The verifier settles an email-heir's share to the recipient they chose,
    ///         after proving they own the email (OTP). Only for wallet-less heirs, and
    ///         only once the will has already flatlined (checked in _claim).
    function claimTo(uint256 id, uint256 index, address recipient) external {
        if (msg.sender != verifier) revert NotVerifier();
        if (recipient == address(0)) revert BadBeneficiary();
        Beneficiary storage b = _beneficiaryAt(id, index);
        if (b.wallet != address(0)) revert BadBeneficiary();
        _claim(id, index, b, recipient);
    }

    function _claim(uint256 id, uint256 index, Beneficiary storage b, address to) internal {
        Will storage w = wills[id];
        if (w.closed) revert Gone();
        if (block.timestamp <= uint256(w.lastActive) + w.interval) revert StillAlive();

        uint256 remainingAlloc = b.allocation - b.claimed;
        uint256 amount = remainingAlloc < w.balance ? remainingAlloc : w.balance;
        if (amount == 0) revert NothingToClaim();

        b.claimed += amount;
        w.balance -= amount;
        emit Claimed(id, index, to, amount);
        _payout(w.token, to, amount);
    }

    // ---- internal helpers ----

    function _ownedActive(uint256 id) internal view returns (Will storage w) {
        w = wills[id];
        if (w.owner != msg.sender) revert NotOwner();
        if (w.closed) revert Gone();
    }

    function _touch(uint256 id, Will storage w) internal {
        w.lastActive = uint64(block.timestamp);
        unchecked { w.beats++; }
        emit Heartbeat(id, w.lastActive, w.beats);
    }

    function _beneficiaryAt(uint256 id, uint256 index) internal view returns (Beneficiary storage) {
        if (index >= _beneficiaries[id].length) revert BadIndex();
        return _beneficiaries[id][index];
    }

    function _pull(address token, address from, uint256 amount) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _payout(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            (bool ok, bytes memory data) =
                token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
            if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        }
    }

    // ---- views ----

    function willsOf(address owner) external view returns (uint256[] memory) {
        return _willsByOwner[owner];
    }

    function willsFor(address beneficiary) external view returns (uint256[] memory) {
        return _willsByBeneficiary[beneficiary];
    }

    function beneficiariesOf(uint256 id) external view returns (Beneficiary[] memory) {
        return _beneficiaries[id];
    }

    function beneficiaryCount(uint256 id) external view returns (uint256) {
        return _beneficiaries[id].length;
    }

    /// @notice Seconds until the will becomes claimable. 0 once the window has lapsed.
    function timeLeft(uint256 id) external view returns (uint256) {
        Will storage w = wills[id];
        uint256 deadline = uint256(w.lastActive) + w.interval;
        return block.timestamp >= deadline ? 0 : deadline - block.timestamp;
    }

    function isClaimable(uint256 id) external view returns (bool) {
        Will storage w = wills[id];
        return !w.closed && w.balance > 0 && block.timestamp > uint256(w.lastActive) + w.interval;
    }

    function getWill(uint256 id) external view returns (Will memory) {
        return wills[id];
    }
}
