import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  console.log("Deploying FanChain NFT Contract with EIP-712 to WireFluid...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Platform wallet (same as deployer for now)
  const platformWallet = deployer.address;

  const FanChain = await ethers.getContractFactory("FanChain");
  const fanChain = await FanChain.deploy(platformWallet);

  await fanChain.waitForDeployment();
  const tokenAddress = await fanChain.getAddress();

  console.log("\n✅ FanChain NFT Contract deployed!");
  console.log("Contract Address:", tokenAddress);
  console.log("Platform Wallet:", platformWallet);
  
  // Create a default campaign for testing
  const currentTime = Math.floor(Date.now() / 1000);
  const tx = await fanChain.createCampaign(
    "PSL 2026 Season",
    "Pakistan Super League 2026 Official Campaign",
    31504000,  // lat: 31.504000 (Islamabad)
    74358700,  // lng: 74.358700 (Lahore)
    1000,      // 1km radius
    currentTime,
    currentTime + (180 * 24 * 60 * 60), // 180 days
    "Gold",
    100, // 100 reward points
    deployer.address
  );
  
  const receipt = await tx.wait();
  console.log("\n📋 Default Campaign Created!");
  console.log("Campaign ID: 0");
  console.log("Name: PSL 2026 Season");
  
  console.log("\n=== IMPORTANT ===");
  console.log("Add this NFT contract to MetaMask:", tokenAddress);
  console.log("Network: WireFluid Testnet (Chain 92533)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });