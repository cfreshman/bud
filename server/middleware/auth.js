const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ message: 'no token provided' })
    }

    // Verify token
    const token = authHeader.split(' ')[1] // Remove "Bearer " prefix
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    // Add user data to request
    req.user = { userId: decoded.userId }
    
    next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(401).json({ message: 'invalid token' })
  }
} 