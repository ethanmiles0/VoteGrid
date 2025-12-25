// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, euint64, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title VoteGrid
/// @notice Private voting contract that keeps tallies encrypted until a poll is finalized.
contract VoteGrid is ZamaEthereumConfig {
    struct Poll {
        string name;
        string[] options;
        uint64 startTime;
        uint64 endTime;
        bool finalized;
        euint64[] encryptedCounts;
        address creator;
    }

    Poll[] private _polls;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    event PollCreated(uint256 indexed pollId, string name, uint64 startTime, uint64 endTime, uint256 optionCount);
    event VoteCast(uint256 indexed pollId, address indexed voter);
    event PollFinalized(uint256 indexed pollId);

    /// @notice Create a new poll with 2-4 options and a voting window.
    /// @param name Name of the poll.
    /// @param options List of answer options (between 2 and 4 entries).
    /// @param startTime Timestamp when voting opens.
    /// @param endTime Timestamp when voting closes.
    /// @return pollId Identifier of the newly created poll.
    function createPoll(
        string calldata name,
        string[] calldata options,
        uint64 startTime,
        uint64 endTime
    ) external returns (uint256 pollId) {
        uint256 optionCount = options.length;
        require(optionCount >= 2 && optionCount <= 4, "Options must be between 2 and 4");
        require(endTime > startTime, "End time must be after start time");
        require(startTime >= block.timestamp, "Start time must be in the future or now");
        require(bytes(name).length > 0, "Name required");

        pollId = _polls.length;
        _polls.push();
        Poll storage poll = _polls[pollId];
        poll.name = name;
        poll.creator = msg.sender;
        poll.startTime = startTime;
        poll.endTime = endTime;

        poll.options = new string[](optionCount);
        poll.encryptedCounts = new euint64[](optionCount);

        for (uint256 i = 0; i < optionCount; i++) {
            poll.options[i] = options[i];
            euint64 encryptedZero = FHE.asEuint64(0);
            // Grant the contract permanent access so counts remain usable in future operations.
            FHE.allowThis(encryptedZero);
            poll.encryptedCounts[i] = encryptedZero;
        }

        emit PollCreated(pollId, name, startTime, endTime, optionCount);
    }

    /// @notice Cast an encrypted vote for a poll option.
    /// @param pollId Identifier of the poll.
    /// @param encryptedChoice Encrypted option index.
    /// @param inputProof Proof produced by the relayer for the encrypted input.
    function castVote(uint256 pollId, externalEuint32 encryptedChoice, bytes calldata inputProof) external {
        require(pollId < _polls.length, "Invalid poll");
        Poll storage poll = _polls[pollId];

        require(block.timestamp >= poll.startTime, "Poll not started");
        require(block.timestamp < poll.endTime, "Poll already ended");
        require(!_hasVoted[pollId][msg.sender], "Address already voted");

        euint32 choice = FHE.fromExternal(encryptedChoice, inputProof);
        uint256 optionCount = poll.options.length;

        for (uint256 i = 0; i < optionCount; i++) {
            ebool matches = FHE.eq(choice, FHE.asEuint32(uint32(i)));
            euint32 increment32 = FHE.select(matches, FHE.asEuint32(1), FHE.asEuint32(0));
            euint64 increment = FHE.asEuint64(increment32);
            poll.encryptedCounts[i] = FHE.add(poll.encryptedCounts[i], increment);
            FHE.allowThis(poll.encryptedCounts[i]);
        }

        _hasVoted[pollId][msg.sender] = true;
        emit VoteCast(pollId, msg.sender);
    }

    /// @notice Finalize a poll after its end time by making tallies publicly decryptable.
    /// @param pollId Identifier of the poll to finalize.
    function finalizePoll(uint256 pollId) external {
        require(pollId < _polls.length, "Invalid poll");
        Poll storage poll = _polls[pollId];

        require(block.timestamp >= poll.endTime, "Poll still active");
        require(!poll.finalized, "Poll already finalized");

        uint256 optionCount = poll.options.length;
        for (uint256 i = 0; i < optionCount; i++) {
            poll.encryptedCounts[i] = FHE.makePubliclyDecryptable(poll.encryptedCounts[i]);
        }

        poll.finalized = true;
        emit PollFinalized(pollId);
    }

    /// @notice Get the number of polls created.
    function totalPolls() external view returns (uint256) {
        return _polls.length;
    }

    /// @notice Get poll metadata without tally information.
    function getPollMetadata(
        uint256 pollId
    )
        external
        view
        returns (string memory name, uint64 startTime, uint64 endTime, bool finalized, address creator, uint256 optionCount)
    {
        require(pollId < _polls.length, "Invalid poll");
        Poll storage poll = _polls[pollId];
        return (poll.name, poll.startTime, poll.endTime, poll.finalized, poll.creator, poll.options.length);
    }

    /// @notice Get the poll options by id.
    function getOptions(uint256 pollId) external view returns (string[] memory) {
        require(pollId < _polls.length, "Invalid poll");
        return _polls[pollId].options;
    }

    /// @notice Check whether an address has voted in a poll.
    function hasAddressVoted(uint256 pollId, address user) external view returns (bool) {
        require(pollId < _polls.length, "Invalid poll");
        return _hasVoted[pollId][user];
    }

    /// @notice Return encrypted tallies after a poll has been finalized.
    function getEncryptedResults(uint256 pollId) external view returns (euint64[] memory) {
        require(pollId < _polls.length, "Invalid poll");
        require(_polls[pollId].finalized, "Poll not finalized");
        return _polls[pollId].encryptedCounts;
    }
}
