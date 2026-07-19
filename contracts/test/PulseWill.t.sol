// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PulseWill.sol";

contract PulseWillTest is Test {
    PulseWill pulse;

    address alice = address(0xA11CE);    // owner
    address max = address(0x11A2);        // beneficiary Maxwell
    address anna = address(0xA22A);       // beneficiary Anna
    address stranger = address(0x5747);
    address verifier = address(0xE417);

    function setUp() public {
        pulse = new PulseWill(verifier);
        vm.deal(alice, 100 ether);
        vm.deal(stranger, 1 ether);
    }

    // build a two-person, first-come pool: each may take the whole balance
    function _fcfsWill(uint256 amount, uint64 interval) internal returns (uint256 id) {
        PulseWill.BeneficiaryInput[] memory p = new PulseWill.BeneficiaryInput[](2);
        p[0] = PulseWill.BeneficiaryInput(max, amount, "Maxwell", "max@mail.com");
        p[1] = PulseWill.BeneficiaryInput(anna, amount, "Anna", "anna@mail.com");
        vm.prank(alice);
        id = pulse.createWill{value: amount}(address(0), amount, interval, "love you both", "owner@example.com", p);
    }

    // build a rationed pool: allocations split the balance
    function _rationedWill(uint256 total, uint256 aMax, uint256 aAnna, uint64 interval)
        internal
        returns (uint256 id)
    {
        PulseWill.BeneficiaryInput[] memory p = new PulseWill.BeneficiaryInput[](2);
        p[0] = PulseWill.BeneficiaryInput(max, aMax, "Maxwell", "");
        p[1] = PulseWill.BeneficiaryInput(anna, aAnna, "Anna", "");
        vm.prank(alice);
        id = pulse.createWill{value: total}(address(0), total, interval, "", "", p);
    }

    function test_create_storesBeneficiaries() public {
        uint256 id = _rationedWill(3 ether, 1 ether, 2 ether, 7 days);
        assertEq(pulse.beneficiaryCount(id), 2);
        assertEq(pulse.getWill(id).balance, 3 ether);
        assertEq(pulse.beneficiariesOf(id)[1].name, "Anna");
    }

    function test_create_revertsNoBeneficiaries() public {
        PulseWill.BeneficiaryInput[] memory p = new PulseWill.BeneficiaryInput[](0);
        vm.prank(alice);
        vm.expectRevert(PulseWill.BadBeneficiary.selector);
        pulse.createWill{value: 1 ether}(address(0), 1 ether, 7 days, "", "", p);
    }

    function test_create_revertsZeroAllocation() public {
        PulseWill.BeneficiaryInput[] memory p = new PulseWill.BeneficiaryInput[](1);
        p[0] = PulseWill.BeneficiaryInput(max, 0, "Maxwell", "");
        vm.prank(alice);
        vm.expectRevert(PulseWill.BadAmount.selector);
        pulse.createWill{value: 1 ether}(address(0), 1 ether, 7 days, "", "", p);
    }

    function test_beat_resetsClock() public {
        uint256 id = _fcfsWill(5 ether, 7 days);
        vm.warp(block.timestamp + 6 days);
        vm.prank(alice);
        pulse.beat(id);
        assertEq(pulse.timeLeft(id), 7 days);
    }

    function test_beat_onlyOwner() public {
        uint256 id = _fcfsWill(5 ether, 7 days);
        vm.prank(stranger);
        vm.expectRevert(PulseWill.NotOwner.selector);
        pulse.beat(id);
    }

    function test_withdraw_ownerPullsBackWhileAlive() public {
        uint256 id = _fcfsWill(5 ether, 7 days);
        uint256 before = alice.balance;
        vm.prank(alice);
        pulse.withdraw(id, 2 ether);
        assertEq(alice.balance - before, 2 ether);
        assertEq(pulse.getWill(id).balance, 3 ether);
    }

    function test_withdraw_resetsClock() public {
        uint256 id = _fcfsWill(5 ether, 7 days);
        vm.warp(block.timestamp + 6 days);
        vm.prank(alice);
        pulse.withdraw(id, 1 ether);
        assertEq(pulse.timeLeft(id), 7 days);
    }

    function test_claim_revertsWhileAlive() public {
        uint256 id = _fcfsWill(5 ether, 7 days);
        vm.prank(max);
        vm.expectRevert(PulseWill.StillAlive.selector);
        pulse.claim(id, 0);
    }

    function test_claim_firstComeFirstServed() public {
        uint256 id = _fcfsWill(5 ether, 7 days);
        vm.warp(block.timestamp + 7 days + 1);

        uint256 before = max.balance;
        vm.prank(max);
        pulse.claim(id, 0);
        assertEq(max.balance - before, 5 ether);         // Maxwell drains the pool
        assertEq(pulse.getWill(id).balance, 0);

        vm.prank(anna);
        vm.expectRevert(PulseWill.NothingToClaim.selector); // nothing left for Anna
        pulse.claim(id, 1);
    }

    function test_claim_rationed() public {
        uint256 id = _rationedWill(3 ether, 1 ether, 2 ether, 7 days);
        vm.warp(block.timestamp + 7 days + 1);

        uint256 bMax = max.balance;
        vm.prank(max);
        pulse.claim(id, 0);
        assertEq(max.balance - bMax, 1 ether);            // capped at his allocation

        uint256 bAnna = anna.balance;
        vm.prank(anna);
        pulse.claim(id, 1);
        assertEq(anna.balance - bAnna, 2 ether);          // gets her full share
        assertEq(pulse.getWill(id).balance, 0);
    }

    function test_claim_wrongBeneficiaryReverts() public {
        uint256 id = _fcfsWill(5 ether, 7 days);
        vm.warp(block.timestamp + 8 days);
        vm.prank(stranger);
        vm.expectRevert(PulseWill.BadBeneficiary.selector);
        pulse.claim(id, 0);
    }

    function _emailWill(uint256 amount, uint64 interval) internal returns (uint256 id) {
        PulseWill.BeneficiaryInput[] memory p = new PulseWill.BeneficiaryInput[](1);
        p[0] = PulseWill.BeneficiaryInput(address(0), amount, "Sarah", "sarah@mail.com");
        vm.prank(alice);
        id = pulse.createWill{value: amount}(address(0), amount, interval, "", "", p);
    }

    function test_emailHeir_requiresEmail() public {
        PulseWill.BeneficiaryInput[] memory p = new PulseWill.BeneficiaryInput[](1);
        p[0] = PulseWill.BeneficiaryInput(address(0), 1 ether, "Sarah", "");
        vm.prank(alice);
        vm.expectRevert(PulseWill.BadBeneficiary.selector);
        pulse.createWill{value: 1 ether}(address(0), 1 ether, 7 days, "", "", p);
    }

    function test_claimTo_verifierSettlesEmailHeir() public {
        uint256 id = _emailWill(2 ether, 7 days);
        vm.warp(block.timestamp + 8 days);

        // only the verifier can settle
        vm.prank(stranger);
        vm.expectRevert(PulseWill.NotVerifier.selector);
        pulse.claimTo(id, 0, stranger);

        // verifier pays the recipient Sarah chose
        uint256 before = stranger.balance;
        vm.prank(verifier);
        pulse.claimTo(id, 0, stranger);
        assertEq(stranger.balance - before, 2 ether);
    }

    function test_claimTo_revertsWhileAlive() public {
        uint256 id = _emailWill(2 ether, 7 days);
        vm.prank(verifier);
        vm.expectRevert(PulseWill.StillAlive.selector);
        pulse.claimTo(id, 0, stranger);
    }

    function test_claimTo_revertsOnWalletHeir() public {
        uint256 id = _fcfsWill(5 ether, 7 days);
        vm.warp(block.timestamp + 8 days);
        vm.prank(verifier);
        vm.expectRevert(PulseWill.BadBeneficiary.selector);
        pulse.claimTo(id, 0, stranger); // heir 0 has a wallet: verifier has no power
    }

    function test_close_refundsOwner() public {
        uint256 id = _fcfsWill(5 ether, 7 days);
        uint256 before = alice.balance;
        vm.prank(alice);
        pulse.close(id);
        assertEq(alice.balance - before, 5 ether);
        vm.prank(max);
        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(PulseWill.Gone.selector);
        pulse.claim(id, 0);
    }

    function test_partialClaimThenPool() public {
        // Maxwell allocated 4, Anna 4, but pool only holds 5: first-come wins the overlap
        uint256 id = _rationedWill(5 ether, 4 ether, 4 ether, 7 days);
        vm.warp(block.timestamp + 8 days);

        vm.prank(max);
        pulse.claim(id, 0);                               // takes his 4
        assertEq(pulse.getWill(id).balance, 1 ether);

        uint256 bAnna = anna.balance;
        vm.prank(anna);
        pulse.claim(id, 1);                               // only 1 left despite 4 alloc
        assertEq(anna.balance - bAnna, 1 ether);
    }

    function testFuzz_withdrawNeverExceedsBalance(uint256 amount) public {
        amount = bound(amount, 1, 50 ether);
        uint256 id = _fcfsWill(amount, 7 days);
        vm.prank(alice);
        vm.expectRevert(PulseWill.BadAmount.selector);
        pulse.withdraw(id, amount + 1);
    }

    function test_setVerifier_guardianRotates() public {
        address newVerifier = makeAddr("rotated");
        vm.expectRevert(PulseWill.NotVerifier.selector);
        vm.prank(alice);
        pulse.setVerifier(newVerifier);

        pulse.setVerifier(newVerifier); // test contract deployed it => guardian
        assertEq(pulse.verifier(), newVerifier);
    }
}