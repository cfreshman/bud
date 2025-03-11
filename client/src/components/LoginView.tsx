import { useState } from 'react'
import { login, register, setToken } from '../services/auth'

export function LoginView({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    try {
      const response = isRegistering 
        ? await register(username, password)
        : await login(username, password)
      
      setToken(response.token)
      onLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong')
    }
  }

  return (
    <div className="login-view">
      <div className="circle" />
      <div className="login-container">
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoComplete="username"
            autoCapitalize="none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoComplete="current-password"
          />
          
          <button type="submit">
            {error ? error : (isRegistering ? 'register' : 'login')}
          </button>
        </form>

        <button 
          className="login-switch"
          onClick={() => setIsRegistering(!isRegistering)}
        >
          {isRegistering ? 'have an account?' : 'need an account?'}
        </button>
      </div>
    </div>
  )
} 