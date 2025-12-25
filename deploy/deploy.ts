import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedVoteGrid = await deploy("VoteGrid", {
    from: deployer,
    log: true,
  });

  console.log(`VoteGrid contract: `, deployedVoteGrid.address);
};
export default func;
func.id = "deploy_voteGrid"; // id required to prevent reexecution
func.tags = ["VoteGrid"];
