const { Memory, User } = require('../models');

// Get all memories for a user
async function getUserMemories(userId) {
  let memory = await Memory.findOne({ userId });
  if (!memory) {
    memory = await Memory.create({ userId, memories: [], goals: [] });
  }
  return memory.memories;
}

// Get all goals for a user
async function getUserGoals(userId) {
  let memory = await Memory.findOne({ userId });
  if (!memory) {
    memory = await Memory.create({ userId, memories: [], goals: [] });
  }
  return memory.goals;
}

// Add a new memory for a user
async function addMemory(userId, content) {
  let memory = await Memory.findOne({ userId });
  if (!memory) {
    memory = await Memory.create({ userId, memories: [content], goals: [] });
  } else {
    // If we have 50 memories, remove the oldest one
    if (memory.memories.length >= 50) {
      memory.memories.shift();
    }
    memory.memories.push(content);
    await memory.save();
  }
}

// Add a new goal for a user
async function setGoal(userId, content) {
  let memory = await Memory.findOne({ userId });
  if (!memory) {
    memory = await Memory.create({ userId, memories: [], goals: [content] });
  } else {
    // If we have 5 goals, don't add more
    if (memory.goals.length >= 5) {
      return false;
    }
    memory.goals.push(content);
    await memory.save();
  }
  return true;
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

// Remove a goal at a specific index
async function unsetGoal(userId, index) {
  const memory = await Memory.findOne({ userId });
  if (!memory || index < 0 || index >= memory.goals.length) {
    return false;
  }
  memory.goals.splice(index, 1);
  await memory.save();
  return true;
}

// Process chat response actions
async function processChatResponse(userId, actions) {
  let chatMessage = null;
  let memoryUpdates = {
    toAdd: [],
    toRemove: new Set()
  };
  let goalUpdates = {
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
      case 'set_goal':
        goalUpdates.toAdd.push(action.content);
        break;
      case 'unset_goal':
        if (typeof action.index === 'number') {
          goalUpdates.toRemove.add(action.index);
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

  // Only make database call if we have memory or goal updates
  if (memoryUpdates.toAdd.length > 0 || memoryUpdates.toRemove.size > 0 || 
      goalUpdates.toAdd.length > 0 || goalUpdates.toRemove.size > 0) {
    let memory = await Memory.findOne({ userId });
    if (!memory) {
      memory = await Memory.create({ userId, memories: [], goals: [] });
    }

    // Remove memories in reverse order to maintain correct indices
    const sortedIndicesToRemove = Array.from(memoryUpdates.toRemove).sort((a, b) => b - a);
    for (const index of sortedIndicesToRemove) {
      if (index >= 0 && index < memory.memories.length) {
        memory.memories.splice(index, 1);
      }
    }

    // Remove goals in reverse order to maintain correct indices
    const sortedGoalIndicesToRemove = Array.from(goalUpdates.toRemove).sort((a, b) => b - a);
    for (const index of sortedGoalIndicesToRemove) {
      if (index >= 0 && index < memory.goals.length) {
        memory.goals.splice(index, 1);
      }
    }

    // Add new memories, respecting 50 memory limit
    const spaceAvailable = 50 - memory.memories.length;
    const memoriesToAdd = memoryUpdates.toAdd.slice(0, spaceAvailable);
    memory.memories.push(...memoriesToAdd);

    // Add new goals, respecting 5 goal limit
    const goalSpaceAvailable = 5 - memory.goals.length;
    const goalsToAdd = goalUpdates.toAdd.slice(0, goalSpaceAvailable);
    memory.goals.push(...goalsToAdd);

    // Save all changes in one operation
    await memory.save();
  }

  // Append star to chat message if we were awarded one
  if (hasAwardedStar && !chatMessage.includes('⭐️')) {
    chatMessage += ' ⭐️';
  } else if (!hasAwardedStar && chatMessage.includes('⭐️')) {
    chatMessage = chatMessage.replace('⭐️', '🌟');
  }

  return chatMessage || 'Meep.';
}

module.exports = {
  getUserMemories,
  getUserGoals,
  addMemory,
  setGoal,
  removeMemory,
  unsetGoal,
  processChatResponse
}; 