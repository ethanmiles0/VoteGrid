import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:poll-address", "Prints the VoteGrid address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const deployment = await deployments.get("VoteGrid");
  console.log("VoteGrid address is " + deployment.address);
});

task("task:create-poll", "Create a new poll")
  .addParam("name", "Poll name")
  .addParam("options", "Comma separated options (2-4)")
  .addParam("start", "Start timestamp (seconds)")
  .addParam("end", "End timestamp (seconds)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("VoteGrid");
    const voteGrid = await ethers.getContractAt("VoteGrid", deployment.address);

    const { name, options, start, end } = taskArguments;
    const parsedOptions = (options as string).split(",").map((o) => o.trim()).filter(Boolean);
    if (parsedOptions.length < 2 || parsedOptions.length > 4) {
      throw new Error("Provide between 2 and 4 options");
    }

    const startTs = BigInt(start as string);
    const endTs = BigInt(end as string);
    const [signer] = await ethers.getSigners();

    const tx = await voteGrid.connect(signer).createPoll(name as string, parsedOptions, startTs, endTs);
    console.log(`Creating poll with tx: ${tx.hash}`);
    await tx.wait();
    console.log("Poll created");
  });

task("task:cast-vote", "Cast an encrypted vote for a poll")
  .addParam("poll", "Poll id")
  .addParam("choice", "Zero-based option index to vote for")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("VoteGrid");
    const voteGrid = await ethers.getContractAt("VoteGrid", deployment.address);
    const pollId = parseInt(taskArguments.poll as string, 10);
    const choice = parseInt(taskArguments.choice as string, 10);

    const [signer] = await ethers.getSigners();

    const encryptedInput = await fhevm.createEncryptedInput(deployment.address, signer.address).add32(choice).encrypt();

    const tx = await voteGrid
      .connect(signer)
      .castVote(pollId, encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Voting tx: ${tx.hash}`);
    await tx.wait();
    console.log("Vote submitted");
  });

task("task:finalize-poll", "Finalize a poll and make results publicly decryptable")
  .addParam("poll", "Poll id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("VoteGrid");
    const voteGrid = await ethers.getContractAt("VoteGrid", deployment.address);
    const pollId = parseInt(taskArguments.poll as string, 10);

    const [signer] = await ethers.getSigners();
    const tx = await voteGrid.connect(signer).finalizePoll(pollId);
    console.log(`Finalize tx: ${tx.hash}`);
    await tx.wait();
    console.log("Poll finalized");
  });

task("task:decrypt-results", "Decrypt results of a finalized poll using your signer key")
  .addParam("poll", "Poll id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("VoteGrid");
    const voteGrid = await ethers.getContractAt("VoteGrid", deployment.address);
    const pollId = parseInt(taskArguments.poll as string, 10);
    const encryptedResults = await voteGrid.getEncryptedResults(pollId);

    const [signer] = await ethers.getSigners();
    console.log(`Poll ${pollId} has ${encryptedResults.length} options`);
    for (let i = 0; i < encryptedResults.length; i++) {
      const clear = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        encryptedResults[i],
        deployment.address,
        signer,
      );
      console.log(`Option ${i}: ${clear.toString()}`);
    }
  });

task("task:list-polls", "List all polls with metadata").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { ethers, deployments } = hre;
  const deployment = await deployments.get("VoteGrid");
  const voteGrid = await ethers.getContractAt("VoteGrid", deployment.address);
  const total = await voteGrid.totalPolls();
  const count = Number(total);

  console.log(`Found ${count} polls`);
  for (let i = 0; i < count; i++) {
    const [name, start, end, finalized, creator, optionCount] = await voteGrid.getPollMetadata(i);
    console.log(
      `[${i}] ${name} | options=${optionCount} | start=${start.toString()} | end=${end.toString()} | finalized=${finalized} | creator=${creator}`,
    );
  }
});
