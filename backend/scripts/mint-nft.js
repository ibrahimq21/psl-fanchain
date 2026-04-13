const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

// Fixed path for Render (relative to script location)
const buildPath = path.join(__dirname, '..', 'build', 'contracts', 'FanChain.json');

const web3 = new Web3(process.env.WIREFLUID_RPC || 'https://evm.wirefluid.com');
const artifact = JSON.parse(fs.readFileSync(buildPath, 'utf8'));
const contractAddress = process.env.CONTRACT_ADDRESS || '0x7Ddb788669d63F20abeCBF55C74604a074681523';
const contract = new web3.eth.Contract(artifact.abi, contractAddress);

const privateKey = process.argv[2] || process.env.PRIVATE_KEY;
const walletAddress = process.argv[3] || '0x65aa7b8bed35c28b910e258431306e2f469e6260';
const campaignId = parseInt(process.argv[4]) || 4;

const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

console.log(`Minting NFT for ${walletAddress}...`);

contract.methods.mintAttendanceNFT(
  walletAddress,
  campaignId,
  `https://pslfanchain.io/nft/${campaignId}/${walletAddress}`,
  31520400,
  74358700,
  'Gaddafi Stadium'
).send({ from: account.address, gas: 400000 })
  .on('transactionHash', h => console.log('Tx:', h))
  .on('receipt', r => console.log('✅ SUCCESS!', r.transactionHash))
  .on('error', e => console.log('❌ Error:', e.message));
