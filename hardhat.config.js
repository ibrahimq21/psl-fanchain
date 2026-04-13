import dotenv from "dotenv";
import "@nomicfoundation/hardhat-toolbox";

dotenv.config({ path: './blockchain/.env' });

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    wirefluid: {
      url: process.env.WIREFLUID_RPC || "https://evm.wirefluid.com",
      chainId: parseInt(process.env.WIREFLUID_CHAIN_ID) || 92533,
      accounts: {
        mnemonic: process.env.WALLET_MNEMONIC || ""
      },
      confirmations: 2,
      timeout: 60000
    }
  }
};
