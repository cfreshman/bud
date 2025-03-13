const { Memory, User } = require('../models');

// Get all memories for a user
async function getUserMemories(userId) {
  let memory = await Memory.findOne({ userId });
  if (!memory) {
    memory = await Memory.create({ userId, memories: [] });
  }
  return memory.memories;
}

// Add a new memory for a user
async function addMemory(userId, content) {
  let memory = await Memory.findOne({ userId });
  if (!memory) {
    memory = await Memory.create({ userId, memories: [content] });
  } else {
    // If we have 50 memories, remove the oldest one
    if (memory.memories.length >= 50) {
      memory.memories.shift();
    }
    memory.memories.push(content);
    await memory.save();
  }
}

// Remove a memory at a specific index
async function removeMemory(userId, index) {
  const memory = await Memory.findOne({ userId });
  if (!memory || index < 0 || index >= memory.memories.length) {
    return;
  }
  memory.memories.splice(index, 1);
  await memory.save();
}

// Process chat response actions
async function processChatResponse(userId, actions) {
  let chatMessage = null;
  let memoryUpdates = {
    toAdd: [],
    toRemove: new Set()
  };
  let hasAwardedStar = false;

  // First pass - collect all actions
  for (const action of actions) {
    switch (action.type) {
      case 'chat':
        chatMessage = action.content;
        break;
      case 'remember':
        memoryUpdates.toAdd.push(action.content);
        break;
      case 'forget':
        if (typeof action.index === 'number') {
          memoryUpdates.toRemove.add(action.index);
        }
        break;
      case 'award_star':
        // Update user's stars
        await User.findByIdAndUpdate(userId, {
          $inc: { 
            totalStars: 1,
            currentStars: 1
          }
        });
        hasAwardedStar = true;
        break;
    }
  }

  // Only make database call if we have memory updates
  if (memoryUpdates.toAdd.length > 0 || memoryUpdates.toRemove.size > 0) {
    let memory = await Memory.findOne({ userId });
    if (!memory) {
      memory = await Memory.create({ userId, memories: [] });
    }

    // Remove memories in reverse order to maintain correct indices
    const sortedIndicesToRemove = Array.from(memoryUpdates.toRemove).sort((a, b) => b - a);
    for (const index of sortedIndicesToRemove) {
      if (index >= 0 && index < memory.memories.length) {
        memory.memories.splice(index, 1);
      }
    }

    // Add new memories, respecting 50 memory limit
    const spaceAvailable = 50 - memory.memories.length;
    const memoriesToAdd = memoryUpdates.toAdd.slice(0, spaceAvailable);
    memory.memories.push(...memoriesToAdd);

    // Save all changes in one operation
    await memory.save();
  }

  // Append star to chat message if we were awarded one
  if (hasAwardedStar && !chatMessage.includes('⭐️')) {
    chatMessage += ' ⭐️';
  }

  return chatMessage || 'Meep.';
}

module.exports = {
  getUserMemories,
  addMemory,
  removeMemory,
  processChatResponse
}; 