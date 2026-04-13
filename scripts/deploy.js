import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'blockchain/.env') });

// Read compiled contract
const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'build/contracts/FanChain.json'), 'utf8'));

async function main() {
  console.log("Deploying FanChain to WireFluid...");
  
  const provider = new ethers.JsonRpcProvider("https://evm.wirefluid.com");
  
  // Create wallet from mnemonic
  const wallet = ethers.Wallet.fromPhrase(process.env.WALLET_MNEMONIC, provider);
  console.log("Deploying from:", wallet.address);
  
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  const platformWallet = wallet.address;
  const contract = await factory.deploy(platformWallet);
  
  console.log("Transaction sent:", contract.deploymentTransaction().hash);
  
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  
  console.log("✅ FanChain deployed to:", address);
  console.log("🔍 Explorer: https://wirefluidscan.com/address/" + address);
  
  // Save address
  fs.writeFileSync(
    path.join(__dirname, 'deployed-address.txt'), 
    address
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
