import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  console.log("Deploying FanChainToken to WireFluid...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Deploy the contract
  const FanChainToken = await ethers.getContractFactory("FanChainToken");
  const token = await FanChainToken.deploy();

  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("FanChainToken deployed to:", tokenAddress);

  // Log token details
  const name = await token.name();
  const symbol = await token.symbol();
  const supply = await token.totalSupply();

  console.log("\nToken Details:");
  console.log("  Name:", name);
  console.log("  Symbol:", symbol);
  console.log("  Total Supply:", ethers.formatEther(supply), "PSLF");

  console.log("\n✅ Deployment successful!");
  console.log("Add this to MetaMask:", tokenAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
