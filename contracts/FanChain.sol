// PSL FanChain Campaign & NFT Contract
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * FanChain Campaign Contract
 * Handles influencer campaigns, NFT minting, and proof-of-attendance
 */
contract FanChain is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // Structure for Campaign
    struct Campaign {
        uint256 id;
        address creator;
        string name;
        string description;
        uint256 stadiumLat;
        uint256 stadiumLng;
        uint256 geoRadius;
        uint256 startTime;
        uint256 endTime;
        string rewardTier;
        uint256 rewardPoints;
        address sponsor;
        uint256 sponsorFee;
        bool active;
    }

    // Structure for NFT (Proof of Attendance)
    struct AttendanceNFT {
        uint256 tokenId;
        address owner;
        uint256 campaignId;
        uint256 timestamp;
        uint256 lat;
        uint256 lng;
        string influencerId;
    }

    // Mappings
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => AttendanceNFT) public nfts;
    mapping(address => uint256[]) public userNFTs;
    mapping(address => uint256) public influencerEarnings;
    mapping(address => uint256) public totalCheckIns;
    mapping(uint256 => string) private _tokenURIs;

    // Platform fee (5%)
    uint256 public platformFee = 500;
    address public platformWallet;

    // Events
    event CampaignCreated(uint256 indexed id, address indexed creator, string name);
    event NFTMinted(uint256 indexed tokenId, address indexed owner, uint256 campaignId);
    event EarningsClaimed(address indexed influencer, uint256 amount);

    // EIP-712 Domain Separator
    bytes32 public DOMAIN_SEPARATOR;
    string constant DOMAIN_NAME = "PSL FanChain";
    string constant DOMAIN_VERSION = "1";

    // Verification struct for signed minting
    struct CheckInProof {
        address user;
        uint256 campaignId;
        uint256 lat;
        uint256 lng;
        uint256 timestamp;
        uint256 nonce;
        uint256 expiry;
    }

    // Hash for verification
    bytes32 public constant CHECKIN_TYPEHASH = keccak256(
        "CheckInProof(address user,uint256 campaignId,uint256 lat,uint256 lng,uint256 timestamp,uint256 nonce,uint256 expiry)"
    );

    // Mapping of used nonces (one-time use)
    mapping(bytes32 => bool) public usedProofs;
    
    // Track if user already minted for campaign
    mapping(address => mapping(uint256 => bool)) public hasMintedCampaign;

    constructor(address _platformWallet) ERC721("PSL FanChain", "PSLF") {
        platformWallet = _platformWallet;
        
        // Initialize EIP-712 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                block.chainid,
                address(this)
            )
        );
    }

    // Mint NFT with signed proof (individual params)
    function mintWithSignature(
        address user,
        uint256 campaignId,
        uint256 lat,
        uint256 lng,
        uint256 timestamp,
        uint256 nonce,
        uint256 expiry,
        bytes calldata signature,
        string memory _tokenURI
    ) external {
        // Verify campaign exists and is active
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.id == campaignId, "Campaign not found");
        require(campaign.active, "Campaign not active");
        
        // Verify timestamp is within campaign window
        require(block.timestamp >= campaign.startTime, "Campaign not started");
        require(block.timestamp <= campaign.endTime, "Campaign ended");
        
        // Verify proof hasn't expired
        require(block.timestamp <= expiry, "Proof expired");
        
        // Verify user hasn't already minted for this campaign
        require(!hasMintedCampaign[user][campaignId], "Already minted");
        
        // Create proof hash
        bytes32 proofHash = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(
                CHECKIN_TYPEHASH,
                user,
                campaignId,
                lat,
                lng,
                timestamp,
                nonce,
                expiry
            ))
        ));
        
        // Verify signature from server (platform wallet)
        require(proofHash.length == 32, "Invalid proof");
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        // Split signature
        require(signature.length == 65, "Invalid signature length");
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        
        // Verify signer is platform wallet
        require(ecrecover(proofHash, v, r, s) == platformWallet, "Invalid signature");
        
        // Mark proof as used
        usedProofs[proofHash] = true;
        
        // Mark user as minted for this campaign
        hasMintedCampaign[user][campaignId] = true;
        
        // Mint NFT
        uint256 newTokenId = _tokenIds.current();
        _mint(user, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);
        
        // Store attendance
        nfts[newTokenId] = AttendanceNFT({
            tokenId: newTokenId,
            owner: user,
            campaignId: campaignId,
            timestamp: block.timestamp,
            lat: lat,
            lng: lng,
            influencerId: Strings.toHexString(campaign.creator)
        });
        
        userNFTs[user].push(newTokenId);
        
        // Update influencer earnings
        influencerEarnings[campaign.creator] += campaign.rewardPoints;
        totalCheckIns[campaign.creator]++;
        
        emit NFTMinted(newTokenId, user, campaignId);
        _tokenIds.increment();
    }

    // Create new campaign
    function createCampaign(
        string memory _name,
        string memory _description,
        uint256 _stadiumLat,
        uint256 _stadiumLng,
        uint256 _geoRadius,
        uint256 _startTime,
        uint256 _endTime,
        string memory _rewardTier,
        uint256 _rewardPoints,
        address _sponsor
    ) external returns (uint256) {
        uint256 campaignId = _tokenIds.current();
        
        campaigns[campaignId] = Campaign({
            id: campaignId,
            creator: msg.sender,
            name: _name,
            description: _description,
            stadiumLat: _stadiumLat,
            stadiumLng: _stadiumLng,
            geoRadius: _geoRadius,
            startTime: _startTime,
            endTime: _endTime,
            rewardTier: _rewardTier,
            rewardPoints: _rewardPoints,
            sponsor: _sponsor,
            sponsorFee: 0,
            active: true
        });

        emit CampaignCreated(campaignId, msg.sender, _name);
        _tokenIds.increment();
        
        return campaignId;
    }

    // Mint NFT for attendance
    function mintAttendanceNFT(
        address _to,
        uint256 _campaignId,
        string memory _tokenURI,
        uint256 _lat,
        uint256 _lng,
        string memory _influencerId
    ) external {
        Campaign storage campaign = campaigns[_campaignId];
        require(campaign.creator == msg.sender, "Not campaign creator");
        require(campaign.active, "Campaign not active");
        require(block.timestamp >= campaign.startTime, "Campaign not started");
        require(block.timestamp <= campaign.endTime, "Campaign ended");

        uint256 newTokenId = _tokenIds.current();
        _mint(_to, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);

        // Store attendance proof
        nfts[newTokenId] = AttendanceNFT({
            tokenId: newTokenId,
            owner: _to,
            campaignId: _campaignId,
            timestamp: block.timestamp,
            lat: _lat,
            lng: _lng,
            influencerId: _influencerId
        });

        userNFTs[_to].push(newTokenId);

        // Update influencer earnings
        uint256 reward = campaign.rewardPoints;
        influencerEarnings[campaign.creator] += reward;
        totalCheckIns[campaign.creator]++;

        emit NFTMinted(newTokenId, _to, _campaignId);
        _tokenIds.increment();
    }

    // Set token URI
    function setTokenURI(uint256 _tokenId, string memory _uri) external onlyOwner {
        _setTokenURI(_tokenId, _uri);
    }

    function _setTokenURI(uint256 _tokenId, string memory _uri) internal {
        _tokenURIs[_tokenId] = _uri;
    }

    function tokenURI(uint256 _tokenId) public view override returns (string memory) {
        require(_ownerOf(_tokenId) != address(0), "Token not found");
        return _tokenURIs[_tokenId];
    }

    // Claim earnings
    function claimEarnings() external {
        uint256 earnings = influencerEarnings[msg.sender];
        require(earnings > 0, "No earnings to claim");

        uint256 net = earnings * (10000 - platformFee) / 10000;
        influencerEarnings[msg.sender] = 0;

        payable(msg.sender).transfer(net);
        if (platformFee > 0) {
            payable(platformWallet).transfer(earnings - net);
        }

        emit EarningsClaimed(msg.sender, net);
    }

    // Toggle campaign status
    function toggleCampaign(uint256 _campaignId) external {
        require(campaigns[_campaignId].creator == msg.sender, "Not creator");
        campaigns[_campaignId].active = !campaigns[_campaignId].active;
    }

    // Get user NFTs
    function getUserNFTs(address _user) external view returns (uint256[] memory) {
        return userNFTs[_user];
    }

    // Get contract stats
    function getContractStats() external view returns (
        uint256 totalCampaigns,
        uint256 totalNFTs,
        uint256 totalEarnings
    ) {
        return (
            _tokenIds.current(),
            _tokenIds.current(),
            address(this).balance
        );
    }

    // Receive Ether
    receive() external payable {}
}
