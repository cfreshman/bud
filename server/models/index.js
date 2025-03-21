const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

// Plant schema
const plantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  plotIndex: {
    type: Number,
    required: true,
    min: 0,
    max: 5
  },
  serializedPlant: {
    type: String,
    required: true
  },
  isCarried: {
    type: Boolean,
    default: false
  },
  lastCarriedAt: {
    type: Date,
    default: null
  },
  shareId: {
    type: String,
    sparse: true,
    unique: true
  }
})

// User schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 8
  },
  password: {
    type: String,
    required: true
  },
  totalStars: {
    type: Number,
    default: 0,
    min: 0
  },
  currentStars: {
    type: Number,
    default: 0,
    min: 0
  },
  lastDailyStarDate: {  // Track when user last got their daily star
    type: String,  // YYYY-MM-DD format
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Chat history schema
const chatHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  plotIndex: {
    type: Number,
    required: true,
    min: 0,
    max: 5
  },
  messages: [{
    id: String,
    plantId: String,
    content: String,
    sender: {
      type: String,
      enum: ['user', 'plant']
    },
    timestamp: Number
  }]
})

// Memory schema - stores 50 memories per user
const memorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    unique: true
  },
  memories: {
    type: [String],
    default: [],
    validate: [arr => arr.length <= 50, 'Memory array cannot exceed 50 items']
  },
  goals: {
    type: [String],
    default: [],
    validate: [arr => arr.length <= 5, 'Goals array cannot exceed 5 items']
  }
})

// Compound indices
plantSchema.index({ userId: 1, plotIndex: 1 }, { unique: true })
chatHistorySchema.index({ userId: 1, plotIndex: 1 }, { unique: true })

// Create models
const Plant = mongoose.model('Plant', plantSchema)
const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema)
const Memory = mongoose.model('Memory', memorySchema)
const User = mongoose.model('User', userSchema)

// Migration function to update users with null stars
async function updateNullStarUsers() {
  try {
    const result = await User.updateMany(
      { totalStars: null },
      { $set: { totalStars: 10, currentStars: 10 } }
    );
    console.log(`Updated ${result.modifiedCount} users with null stars to 10 stars`);
  } catch (error) {
    console.error('Error updating null star users:', error);
  }
}

// Run migration when models are initialized
updateNullStarUsers();

module.exports = {
  Plant,
  ChatHistory,
  Memory,
  User
}