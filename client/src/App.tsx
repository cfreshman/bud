import { useState } from 'react'
import { Greenhouse } from './components/Greenhouse'
import { Editor } from './components/Editor'
import { PlantData } from './engine/types'
import './App.css'

function App() {
  const [selectedPlot, setSelectedPlot] = useState<number | null>(null)
  const [plants, setPlants] = useState<Map<number, PlantData>>(new Map())
  const [isEditing, setIsEditing] = useState(false)

  const handleSelectPlot = (plotIndex: number, plantData?: PlantData) => {
    setSelectedPlot(plotIndex)
    setIsEditing(true)
  }

  const handleSavePlant = (plantData: PlantData) => {
    if (selectedPlot !== null) {
      const newPlants = new Map(plants)
      newPlants.set(selectedPlot, plantData)
      setPlants(newPlants)
      setIsEditing(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleDeletePlant = () => {
    if (selectedPlot !== null) {
      const newPlants = new Map(plants)
      newPlants.delete(selectedPlot)
      setPlants(newPlants)
      setIsEditing(false)
    }
  }

  return (
    <div className="app">
      <div className="main-view">
        {isEditing ? (
          <Editor 
            plantData={selectedPlot !== null ? plants.get(selectedPlot) : undefined}
            onSave={handleSavePlant}
            onCancel={handleCancelEdit}
            onDelete={handleDeletePlant}
          />
        ) : (
          <Greenhouse 
            plants={plants}
            onSelectPlot={handleSelectPlot}
          />
        )}
      </div>
    </div>
  )
}

export default App

