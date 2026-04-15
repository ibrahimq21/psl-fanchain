// PSL FanChain ERC-20 Token Contract
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * FanChainToken - ERC-20 Token for PSL FanChain
 * Used for fan rewards, voting, and ecosystem incentives
 */
contract FanChainToken is ERC20, Ownable {
    // Token details
    string private _name = "PSL FanChain Token";
    string private _symbol = "PSLF";
    uint256 private _totalSupply = 1000000 * 10**18; // 1 million tokens

    // Max supply cap
    uint256 public constant MAX_SUPPLY = 10000000 * 10**18; // 10 million max

    // Transfer limits (anti-whale)
    mapping(address => uint256) public transferLimits;
    uint256 public defaultTransferLimit = 100000 * 10**18; // 100k default

    // Vesting schedule for team/advisors
    mapping(address => uint256) public vestingAmounts;
    mapping(address => uint256) public vestingStart;
    mapping(address => uint256) public vestingCliff; // 6 months cliff
    uint256 public constant VESTING_DURATION = 730 days; // 2 years

    // Events
    event TokensMinted(address indexed to, uint256 amount);
    event TransferLimitChanged(address indexed account, uint256 newLimit);
    event VestingStarted(address indexed beneficiary, uint256 amount);

    constructor() ERC20(_name, _symbol) {
        // Mint total supply to deployer
        _mint(msg.sender, _totalSupply);
        emit TokensMinted(msg.sender, _totalSupply);
    }

    // Mint additional tokens (up to MAX_SUPPLY)
    function mint(address to, uint256 amount) external onlyOwner {
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "Exceeds max supply"
        );
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    // Set transfer limit for specific address
    function setTransferLimit(address account, uint256 limit) external onlyOwner {
        transferLimits[account] = limit;
        emit TransferLimitChanged(account, limit);
    }

    // Set default transfer limit
    function setDefaultTransferLimit(uint256 limit) external onlyOwner {
        defaultTransferLimit = limit;
    }

    // Override transfer to enforce limits
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        // Skip for minting (from == address(0))
        if (from == address(0)) return;

        // Skip for burning (to == address(0))
        if (to == address(0)) return;

        // Check transfer limit (except owner)
        if (msg.sender != owner()) {
            uint256 limit = transferLimits[to];
            if (limit == 0) {
                limit = defaultTransferLimit;
            }
            require(amount <= limit, "Exceeds transfer limit");
        }
    }

    // Start vesting for team/advisor
    function startVesting(address beneficiary, uint256 amount) external onlyOwner {
        require(vestingAmounts[beneficiary] == 0, "Vesting already active");
        require(balanceOf(owner()) >= amount, "Insufficient balance");

        // Transfer tokens to this contract for vesting
        _transfer(owner(), address(this), amount);

        vestingAmounts[beneficiary] = amount;
        vestingStart[beneficiary] = block.timestamp;
        vestingCliff[beneficiary] = block.timestamp + 180 days; // 6 months

        emit VestingStarted(beneficiary, amount);
    }

    // Claim vested tokens
    function claimVested() external {
        uint256 amount = vestingAmounts[msg.sender];
        require(amount > 0, "No vesting");

        uint256 start = vestingStart[msg.sender];
        uint256 cliff = vestingCliff[msg.sender];

        // Check cliff
        require(block.timestamp >= cliff, "Cliff not reached");

        // Calculate vested amount
        uint256 timePassed = block.timestamp - start;
        uint256 vested;
        if (timePassed >= VESTING_DURATION) {
            vested = amount;
        } else {
            vested = (amount * timePassed) / VESTING_DURATION;
        }

        // Transfer vested tokens
        _transfer(address(this), msg.sender, vested);

        // Clear vesting (simplified - in production would track claimed)
        vestingAmounts[msg.sender] = 0;
    }

    // Get vesting info
    function getVestingInfo(address beneficiary) external view returns (
        uint256 totalAmount,
        uint256 startTime,
        uint256 cliffTime,
        uint256 vestedAmount
    ) {
        uint256 amount = vestingAmounts[beneficiary];
        if (amount == 0) {
            return (0, 0, 0, 0);
        }

        uint256 start = vestingStart[beneficiary];
        uint256 cliff = vestingCliff[beneficiary];
        
        uint256 vested;
        if (block.timestamp >= cliff) {
            uint256 timePassed = block.timestamp - start;
            if (timePassed >= VESTING_DURATION) {
                vested = amount;
            } else {
                vested = (amount * timePassed) / VESTING_DURATION;
            }
        }

        return (amount, start, cliff, vested);
    }

    // Burn tokens
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // Burn from (for approvals)
    function burnFrom(address from, uint256 amount) external {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }
}
