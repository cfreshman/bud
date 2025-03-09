# Bud Server

Backend server for the Bud plant companion application.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file based on `.env.example`:
   ```
   cp .env.example .env
   ```

3. Add your OpenAI API key to the `.env` file:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

## Running the Server

Development mode with auto-restart:
```
npm run dev
```

Production mode:
```
npm start
```

## API Endpoints

### POST /api/chat
Send a message to a plant and get a response.

**Request Body:**
```json
{
  "plantId": "unique-plant-id",
  "message": "Hello plant, how are you today?",
  "plantAttributes": {
    "parts": [
      {
        "type": "stem",
        "attributes": { "color": "green" }
      },
      {
        "type": "flower",
        "attributes": { "color": "red" }
      }
    ]
  }
}
```

**Response:**
```json
{
  "plantId": "unique-plant-id",
  "message": "I'm feeling sunny today! How about you?",
  "timestamp": 1678901234567
}
```

## Features

- Personality generation based on plant attributes
- Conversation memory for each plant
- Integration with OpenAI API for natural responses 