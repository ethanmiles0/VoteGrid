import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { VoteGrid, VoteGrid__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

describe("VoteGrid", function () {
  let signers: Signers;
  let voteGrid: VoteGrid;
  let voteGridAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    const factory = (await ethers.getContractFactory("VoteGrid")) as VoteGrid__factory;
    voteGrid = (await factory.deploy()) as VoteGrid;
    voteGridAddress = await voteGrid.getAddress();
  });

  async function createPollWindow() {
    const now = await time.latest();
    const start = now + 5;
    const end = start + 3600;
    return { start, end };
  }

  async function encryptChoice(pollId: number, voter: HardhatEthersSigner, choice: number) {
    const encryptedInput = await fhevm.createEncryptedInput(voteGridAddress, voter.address).add32(choice).encrypt();
    return voteGrid.connect(voter).castVote(pollId, encryptedInput.handles[0], encryptedInput.inputProof);
  }

  it("creates a poll and tallies encrypted votes", async function () {
    const { start, end } = await createPollWindow();
    const options = ["Option A", "Option B", "Option C"];

    const tx = await voteGrid.createPoll("Launch Plan", options, BigInt(start), BigInt(end));
    await tx.wait();

    const [name, startTime, endTime, finalized, creator, optionCount] = await voteGrid.getPollMetadata(0);
    expect(name).to.eq("Launch Plan");
    expect(startTime).to.eq(BigInt(start));
    expect(endTime).to.eq(BigInt(end));
    expect(finalized).to.eq(false);
    expect(creator).to.eq(signers.deployer.address);
    expect(optionCount).to.eq(options.length);

    await time.increaseTo(start + 10);
    await encryptChoice(0, signers.alice, 1);
    await encryptChoice(0, signers.bob, 2);

    await expect(voteGrid.finalizePoll(0)).to.be.revertedWith("Poll still active");

    await time.increaseTo(end + 1);
    await voteGrid.finalizePoll(0);

    const encryptedResults = await voteGrid.getEncryptedResults(0);
    expect(encryptedResults.length).to.eq(options.length);

    const handles = encryptedResults.map((h) => h as string);
    const { clearValues } = await fhevm.publicDecrypt(handles);
    const aliceResult = clearValues[handles[1]];
    const bobResult = clearValues[handles[2]];

    expect(aliceResult).to.eq(1);
    expect(bobResult).to.eq(1);
  });

  it("prevents double voting from the same address", async function () {
    const { start, end } = await createPollWindow();
    const options = ["Yes", "No"];
    await voteGrid.createPoll("Double Vote Check", options, BigInt(start), BigInt(end));

    await time.increaseTo(start + 2);
    await encryptChoice(0, signers.alice, 0);
    await expect(encryptChoice(0, signers.alice, 1)).to.be.revertedWith("Address already voted");
  });
});
