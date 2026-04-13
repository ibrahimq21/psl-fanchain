/**
 * Truffle Config for PSL FanChain
 * 
 * Networks:
 * - development: Local Ganache
 * - wirefluid: WireFluid Testnet
 */

require('dotenv').config({ path: __dirname + '/blockchain/.env' });
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    // Local development
    development: {
      host: '127.0.0.1',
      port: 7545,
      network_id: '*'
    },
    
    // WireFluid Testnet
    wirefluid: {
      provider: () => {
        const mnemonic = process.env.WALLET_MNEMONIC || '';
        if (!mnemonic) {
          throw new Error('WALLET_MNEMONIC not set in blockchain/.env');
        }
        return new HDWalletProvider({
          mnemonic: {
            phrase: mnemonic
          },
          providerOrUrl: process.env.WIREFLUID_RPC || 'https://evm.wirefluid.com',
          chainId: parseInt(process.env.WIREFLUID_CHAIN_ID) || 92533
        });
      },
      network_id: '*',
      chainId: parseInt(process.env.WIREFLUID_CHAIN_ID) || 92533,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: false,
      explorer: process.env.WIREFLUID_EXPLORER || 'https://wirefluidscan.com',
      websocket: false
    }
  },
  
  compilers: {
    solc: {
      version: '0.8.19',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  
  contracts_directory: './contracts',
  contracts_build_directory: './build/contracts',
  
  mocha: {
    timeout: 100000
  }
};
