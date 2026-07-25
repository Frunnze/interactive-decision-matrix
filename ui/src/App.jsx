import React, { useState, useMemo, useEffect } from 'react'
import './App.css'

const STORAGE_KEY = 'decision_matrices'
const CURRENT_MATRIX_KEY = 'current_matrix_id'
const EPSILON = 1e-9

const clampMark = (value, optionCount) => {
  const num = Math.round(Number(value))
  if (!Number.isFinite(num)) return 1
  return Math.max(1, Math.min(optionCount, num))
}

const deriveWeights = (criteria) => criteria.map((_, index) => criteria.length - index)

const weightsContradictOrder = (criteria, storedWeights) => {
  if (!Array.isArray(storedWeights) || storedWeights.length !== criteria.length) return false
  const derived = deriveWeights(criteria)
  return storedWeights.some((w, i) => Number(w) !== derived[i])
}

const normalizeMatrix = (data) => {
  const criteria = Array.isArray(data.criteria) && data.criteria.length > 0
    ? data.criteria.map(String)
    : ['Criterion 1']
  const options = Array.isArray(data.options) && data.options.length > 0
    ? data.options.map(String)
    : ['Option 1']

  const rawMarks = Array.isArray(data.marks) ? data.marks : []
  const marks = criteria.map((_, criterionIndex) => {
    const row = Array.isArray(rawMarks[criterionIndex]) ? rawMarks[criterionIndex] : []
    return options.map((_, optionIndex) => clampMark(row[optionIndex], options.length))
  })

  return { criteria, options, marks }
}

function App() {
  const [showCatalog, setShowCatalog] = useState(false)
  const [matrixName, setMatrixName] = useState('Untitled Matrix')
  const [currentMatrixId, setCurrentMatrixId] = useState(null)
  const [criteria, setCriteria] = useState(['Criterion 1', 'Criterion 2', 'Criterion 3'])
  const [options, setOptions] = useState(['Option 1', 'Option 2'])
  const [marks, setMarks] = useState([
    [1, 1],
    [1, 1],
    [1, 1]
  ])
  const [savedMatrices, setSavedMatrices] = useState([])
  const [draggedIndex, setDraggedIndex] = useState(null)

  const weights = useMemo(() => deriveWeights(criteria), [criteria])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const matrices = JSON.parse(stored)
        setSavedMatrices(matrices)
        
        const currentId = localStorage.getItem(CURRENT_MATRIX_KEY)
        if (currentId) {
          const matrix = matrices.find(m => m.id === currentId)
          if (matrix) {
            const normalized = normalizeMatrix(matrix)
            setMatrixName(matrix.name)
            setCriteria(normalized.criteria)
            setOptions(normalized.options)
            setMarks(normalized.marks)
            setCurrentMatrixId(matrix.id)
          }
        }
      } catch (e) {
        console.error('Error loading saved matrices:', e)
      }
    }
  }, [])

  const getMatrixData = () => ({
    id: currentMatrixId || Date.now().toString(),
    name: matrixName,
    criteria,
    options,
    weights,
    marks,
    updatedAt: new Date().toISOString()
  })

  const saveMatrix = () => {
    const matrixData = getMatrixData()
    const matrices = [...savedMatrices]
    const existingIndex = matrices.findIndex(m => m.id === matrixData.id)
    
    if (existingIndex !== -1) {
      matrices[existingIndex] = matrixData
    } else {
      matrices.push(matrixData)
    }
    
    setSavedMatrices(matrices)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matrices))
    setCurrentMatrixId(matrixData.id)
    localStorage.setItem(CURRENT_MATRIX_KEY, matrixData.id)
    
    downloadMatrix(matrixData)
  }

  const downloadMatrix = (matrixData) => {
    const dataStr = JSON.stringify(matrixData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${matrixData.name.replace(/[^a-z0-9]/gi, '_')}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const loadMatrix = (matrixId) => {
    const matrix = savedMatrices.find(m => m.id === matrixId)
    if (matrix) {
      const normalized = normalizeMatrix(matrix)
      setMatrixName(matrix.name)
      setCriteria(normalized.criteria)
      setOptions(normalized.options)
      setMarks(normalized.marks)
      setCurrentMatrixId(matrix.id)
      localStorage.setItem(CURRENT_MATRIX_KEY, matrix.id)
      setShowCatalog(false)
    }
  }

  const deleteMatrix = (matrixId) => {
    if (window.confirm('Are you sure you want to delete this matrix?')) {
      const updated = savedMatrices.filter(m => m.id !== matrixId)
      setSavedMatrices(updated)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      
      if (currentMatrixId === matrixId) {
        setCurrentMatrixId(null)
        setMatrixName('Untitled Matrix')
        setCriteria(['Criterion 1', 'Criterion 2', 'Criterion 3'])
        setOptions(['Option 1', 'Option 2'])
        setMarks([[1, 1], [1, 1], [1, 1]])
        localStorage.removeItem(CURRENT_MATRIX_KEY)
      }
    }
  }

  const createNewMatrix = () => {
    setCurrentMatrixId(null)
    setMatrixName('Untitled Matrix')
    setCriteria(['Criterion 1', 'Criterion 2', 'Criterion 3'])
    setOptions(['Option 1', 'Option 2'])
    setMarks([[1, 1], [1, 1], [1, 1]])
    localStorage.removeItem(CURRENT_MATRIX_KEY)
    setShowCatalog(false)
  }

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const matrixData = JSON.parse(e.target.result)
          const normalized = normalizeMatrix(matrixData)

          if (weightsContradictOrder(normalized.criteria, matrixData.weights)) {
            alert(
              'The "weights" in this file do not match its criteria order.\n\n' +
              'Weights are always recalculated from row order (first criterion = highest), ' +
              'so the stored values were ignored. Drag rows to change the weighting.'
            )
          }

          setMatrixName(matrixData.name || 'Imported Matrix')
          setCriteria(normalized.criteria)
          setOptions(normalized.options)
          setMarks(normalized.marks)
          setCurrentMatrixId(null)
          setShowCatalog(false)
        } catch (error) {
          alert('Error loading file. Please check the file format.')
          console.error('Error parsing JSON:', error)
        }
      }
      reader.readAsText(file)
    }
    event.target.value = ''
  }

  const totalSumWeights = useMemo(() => {
    return weights.reduce((sum, weight) => sum + weight, 0)
  }, [weights])

  const totals = useMemo(() => {
    if (totalSumWeights === 0) return options.map(() => 0)

    return options.map((_, optionIndex) => {
      const weightedSum = criteria.reduce((total, _, criterionIndex) => {
        const mark = marks[criterionIndex]?.[optionIndex] ?? 0
        const weight = weights[criterionIndex]
        return total + (mark * weight)
      }, 0)
      return weightedSum / totalSumWeights
    })
  }, [marks, weights, totalSumWeights, criteria.length, options.length])

  const percentageAdvantage = useMemo(() => {
    if (totals.length < 2) return null
    
    const sortedTotals = [...totals].sort((a, b) => b - a)
    const highest = sortedTotals[0]
    const secondHighest = sortedTotals[1]
    
    if (highest - secondHighest <= EPSILON || secondHighest === 0) return null
    
    const highestIndex = totals.indexOf(highest)
    
    const percentage = ((highest - secondHighest) / secondHighest) * 100
    return {
      percentage: percentage,
      highestIndex: highestIndex
    }
  }, [totals])

  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', '')
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.currentTarget.classList.add('drag-over')
  }

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over')
  }

  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    e.currentTarget.classList.remove('drag-over')
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      return
    }

    const newCriteria = [...criteria]
    const newMarks = [...marks]
    
    const [draggedCriterion] = newCriteria.splice(draggedIndex, 1)
    const [draggedMark] = newMarks.splice(draggedIndex, 1)
    
    newCriteria.splice(dropIndex, 0, draggedCriterion)
    newMarks.splice(dropIndex, 0, draggedMark)
    
    setCriteria(newCriteria)
    setMarks(newMarks)
    setDraggedIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    document.querySelectorAll('.decision-matrix tbody tr').forEach(row => {
      row.classList.remove('drag-over')
    })
  }

  const handleMarkChange = (criterionIndex, optionIndex, value) => {
    const clampedValue = clampMark(value, options.length)

    const newMarks = marks.map((row, i) => {
      if (i === criterionIndex) {
        return row.map((mark, j) => j === optionIndex ? clampedValue : mark)
      }
      return row
    })
    setMarks(newMarks)
  }

  const addCriterion = () => {
    setCriteria([...criteria, `Criterion ${criteria.length + 1}`])
    setMarks([...marks, new Array(options.length).fill(1)])
  }

  const removeCriterion = (index) => {
    if (criteria.length <= 1) return
    setCriteria(criteria.filter((_, i) => i !== index))
    setMarks(marks.filter((_, i) => i !== index))
  }

  const addOption = () => {
    setOptions([...options, `Option ${options.length + 1}`])
    setMarks(marks.map(row => [...row, 1]))
  }

  const removeOption = (index) => {
    if (options.length <= 1) return
    const newOptions = options.filter((_, i) => i !== index)
    setOptions(newOptions)
    setMarks(marks.map(row =>
      row
        .filter((_, i) => i !== index)
        .map(mark => clampMark(mark, newOptions.length))
    ))
  }

  const updateCriterionName = (index, value) => {
    const newCriteria = [...criteria]
    newCriteria[index] = value
    setCriteria(newCriteria)
  }

  const updateOptionName = (index, value) => {
    const newOptions = [...options]
    newOptions[index] = value
    setOptions(newOptions)
  }

  if (showCatalog) {
    return (
      <div className="app">
        <h1>Decision Matrix Catalog</h1>
        
        <div className="catalog-controls">
          <button onClick={() => setShowCatalog(false)} className="btn btn-secondary">
            ← Back to Matrix
          </button>
          <button onClick={createNewMatrix} className="btn btn-primary">
            + New Matrix
          </button>
          <label className="btn btn-primary file-upload-label">
            📁 Upload JSON
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        <div className="catalog">
          {savedMatrices.length === 0 ? (
            <div className="empty-catalog">
              <p>No saved matrices yet.</p>
              <p>Create a matrix and save it to see it here.</p>
            </div>
          ) : (
            <div className="matrix-list">
              {savedMatrices.map((matrix) => (
                <div key={matrix.id} className="matrix-card">
                  <div className="matrix-card-header">
                    <h3>{matrix.name}</h3>
                    <div className="matrix-card-actions">
                      <button
                        onClick={() => loadMatrix(matrix.id)}
                        className="btn btn-small btn-primary"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => deleteMatrix(matrix.id)}
                        className="btn btn-small btn-danger"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="matrix-card-info">
                    <p><strong>Criteria:</strong> {matrix.criteria.length}</p>
                    <p><strong>Options:</strong> {matrix.options.length}</p>
                    <p><strong>Updated:</strong> {new Date(matrix.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="header-bar">
        <h1>Decision Matrix</h1>
        <div className="header-actions">
          <button onClick={() => setShowCatalog(true)} className="btn btn-secondary">
            📚 Catalog
          </button>
          <button onClick={saveMatrix} className="btn btn-success">
            💾 Save
          </button>
        </div>
      </div>

      <div className="matrix-name-section">
        <label>
          <strong>Matrix Name:</strong>
          <input
            type="text"
            value={matrixName}
            onChange={(e) => setMatrixName(e.target.value)}
            className="matrix-name-input"
            placeholder="Enter matrix name"
          />
        </label>
      </div>
      
      <div className="controls">
        <button onClick={addCriterion} className="btn btn-primary">
          + Add Criterion
        </button>
        <button onClick={addOption} className="btn btn-primary">
          + Add Option
        </button>
        <label className="btn btn-secondary file-upload-label">
          📁 Upload JSON
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      <div className="table-container">
        <table className="decision-matrix">
          <thead>
            <tr>
              <th className="criterion-col">Criteria (drag to reorder)</th>
              {options.map((option, index) => (
                <th key={index} className="option-col">
                  <div className="header-content">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updateOptionName(index, e.target.value)}
                      className="header-input"
                    />
                    {options.length > 1 && (
                      <button
                        onClick={() => removeOption(index)}
                        className="remove-btn"
                        title="Remove option"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion, criterionIndex) => (
              <tr 
                key={criterionIndex}
                onDragOver={(e) => handleDragOver(e, criterionIndex)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, criterionIndex)}
                className={draggedIndex === criterionIndex ? 'dragging' : ''}
              >
                <td className="criterion-col">
                  <div className="criterion-content">
                    <span 
                      className="drag-handle" 
                      title="Drag to reorder"
                      draggable
                      onDragStart={(e) => handleDragStart(e, criterionIndex)}
                      onDragEnd={handleDragEnd}
                    >☰</span>
                    <input
                      type="text"
                      value={criterion}
                      onChange={(e) => updateCriterionName(criterionIndex, e.target.value)}
                      className="criterion-input"
                    />
                    {criteria.length > 1 && (
                      <button
                        onClick={() => removeCriterion(criterionIndex)}
                        className="remove-btn"
                        title="Remove criterion"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="weight-display">
                    Weight: <strong>{weights[criterionIndex]}</strong>
                  </div>
                </td>
                {options.map((_, optionIndex) => (
                  <td key={optionIndex} className="mark-col">
                    <input
                      type="number"
                      min="1"
                      max={options.length}
                      value={marks[criterionIndex][optionIndex]}
                      onChange={(e) => handleMarkChange(criterionIndex, optionIndex, e.target.value)}
                      className="cell-input"
                    />
                    <span className="hint">(1-{options.length})</span>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="totals-row">
              <td className="criterion-col">
                <strong>Total</strong>
              </td>
              {totals.map((total, index) => (
                <td key={index} className="total-col">
                  <div className="total-value">
                    <strong>{total.toFixed(2)}</strong>
                    {percentageAdvantage && percentageAdvantage.highestIndex === index && (
                      <span className="percentage-advantage">
                        +{percentageAdvantage.percentage.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="info">
        <p><strong>Instructions:</strong></p>
        <ul>
          <li>Weights: Determined by order - first criterion has highest weight ({criteria.length}), last has lowest (1). Drag rows to reorder.</li>
          <li>Marks: Enter a value between 1 and the number of options ({options.length})</li>
          <li>Total: Calculated as sum of (mark × weight / total sum of weights)</li>
        </ul>
      </div>
    </div>
  )
}

export default App
