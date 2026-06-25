import { useState, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import './App.css'

const initialItems = [
  { id: 1, content: '第一项 - 这是一个较短的项目', color: '#6366f1' },
  { id: 2, content: '第二项 - 这个项目的内容比较长，高度会更高一些，测试不同高度的元素是否能正确排序', color: '#8b5cf6' },
  { id: 3, content: '第三项', color: '#ec4899' },
  { id: 4, content: '第四项 - 这是一个中等长度的项目内容，用于测试不同高度的元素拖拽', color: '#f59e0b' },
  { id: 5, content: '第五项', color: '#10b981' },
  { id: 6, content: '第六项 - 这个项目内容非常长，用来测试多行文本的高度是否能被正确计算和处理', color: '#06b6d4' },
]

function App() {
  const [items, setItems] = useState(initialItems)
  const [draggingId, setDraggingId] = useState(null)
  const listRef = useRef(null)
  const itemRefs = useRef({})
  const coordsRef = useRef([])
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const ghostElRef = useRef(null)

  const handleMouseDown = useCallback((e, item) => {
    e.preventDefault()
    
    const itemEl = itemRefs.current[item.id]
    itemEl.style.visibility = 'hidden'
    
    const itemRect = itemEl.getBoundingClientRect()
    const listRect = listRef.current.getBoundingClientRect()
    
    const coords = items.map((it) => {
      const el = itemRefs.current[it.id]
      const rect = el.getBoundingClientRect()
      return {
        id: it.id,
        height: rect.height,
        offsetY: 0
      }
    })
    coordsRef.current = coords
    
    let y = 0
    coordsRef.current.forEach((coord) => {
      coord.top = y
      coord.center = y + coord.height / 2
      y += coord.height + 8
    })
    
    dragOffsetRef.current = {
      x: e.clientX - itemRect.left,
      y: e.clientY - itemRect.top
    }
    
    setDraggingId(item.id)
    
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.style.left = itemRect.left + 'px'
    ghost.style.top = itemRect.top + 'px'
    ghost.style.width = itemRect.width + 'px'
    ghost.style.setProperty('--item-color', item.color)
    ghost.innerHTML = itemEl.innerHTML
    document.body.appendChild(ghost)
    ghostElRef.current = ghost
    
    const handleMouseMove = (e) => {
      const ghost = ghostElRef.current
      if (!ghost) return
      
      const ghostLeft = e.clientX - dragOffsetRef.current.x
      const ghostTop = e.clientY - dragOffsetRef.current.y
      ghost.style.left = ghostLeft + 'px'
      ghost.style.top = ghostTop + 'px'
      
      const listRect = listRef.current.getBoundingClientRect()
      const ghostTopRel = ghostTop - listRect.top
      
      let swapped = true
      while (swapped) {
        swapped = false
        const currentIndex = coordsRef.current.findIndex(c => c.id === item.id)
        if (currentIndex === -1) break
        
        const currentCoord = coordsRef.current[currentIndex]
        const ghostBottomRel = ghostTopRel + currentCoord.height
        
        if (currentIndex < coordsRef.current.length - 1) {
          const nextCoord = coordsRef.current[currentIndex + 1]
          if (ghostBottomRel > nextCoord.center) {
            const movingDistance = currentCoord.height + 8
            
            nextCoord.offsetY -= movingDistance
            const nextEl = itemRefs.current[nextCoord.id]
            if (nextEl) {
              nextEl.style.transform = `translateY(${nextCoord.offsetY}px)`
            }
            
            const temp = coordsRef.current[currentIndex]
            coordsRef.current[currentIndex] = coordsRef.current[currentIndex + 1]
            coordsRef.current[currentIndex + 1] = temp
            
            let y = 0
            coordsRef.current.forEach((coord) => {
              coord.top = y
              coord.center = y + coord.height / 2
              y += coord.height + 8
            })
            
            swapped = true
            continue
          }
        }
        
        if (currentIndex > 0) {
          const prevCoord = coordsRef.current[currentIndex - 1]
          if (ghostTopRel < prevCoord.center) {
            const movingDistance = currentCoord.height + 8
            
            prevCoord.offsetY += movingDistance
            const prevEl = itemRefs.current[prevCoord.id]
            if (prevEl) {
              prevEl.style.transform = `translateY(${prevCoord.offsetY}px)`
            }
            
            const temp = coordsRef.current[currentIndex]
            coordsRef.current[currentIndex] = coordsRef.current[currentIndex - 1]
            coordsRef.current[currentIndex - 1] = temp
            
            let y = 0
            coordsRef.current.forEach((coord) => {
              coord.top = y
              coord.center = y + coord.height / 2
              y += coord.height + 8
            })
            
            swapped = true
            continue
          }
        }
      }
    }
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      const ghost = ghostElRef.current
      if (!ghost) return
      
      const currentIndex = coordsRef.current.findIndex(c => c.id === item.id)
      if (currentIndex === -1) {
        ghost.remove()
        ghostElRef.current = null
        setDraggingId(null)
        return
      }
      
      const listRect = listRef.current.getBoundingClientRect()
      const targetCoord = coordsRef.current[currentIndex]
      const targetTop = targetCoord.top + listRect.top + targetCoord.offsetY
      const targetLeft = listRect.left
      
      ghost.style.transition = 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      ghost.style.left = targetLeft + 'px'
      ghost.style.top = targetTop + 'px'
      
      setTimeout(() => {
        if (ghostElRef.current) {
          ghostElRef.current.remove()
          ghostElRef.current = null
        }
        
        Object.values(itemRefs.current).forEach(el => {
          if (el) {
            el.style.transition = 'none'
          }
        })
        
        const newItems = coordsRef.current.map(coord => 
          items.find(it => it.id === coord.id)
        ).filter(Boolean)
        
        flushSync(() => {
          setItems(newItems)
          setDraggingId(null)
        })
        
        Object.values(itemRefs.current).forEach(el => {
          if (el) {
            el.style.transform = ''
            el.style.visibility = ''
          }
        })
        
        coordsRef.current = []
        
        setTimeout(() => {
          Object.values(itemRefs.current).forEach(el => {
            if (el) {
              el.style.transition = ''
            }
          })
        }, 50)
      }, 300)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [items])

  const handleItemRef = (el, item) => {
    if (el) {
      itemRefs.current[item.id] = el
    }
  }

  return (
    <div className="app">
      <h1>拖拽排序 Demo</h1>
      <p className="description">拖动列表项到目标位置，被经过的元素会主动避让</p>
      <ul ref={listRef} className="draggable-list">
        {items.map((item) => (
          <li
            key={item.id}
            data-id={item.id}
            ref={(el) => handleItemRef(el, item)}
            className={`draggable-item ${draggingId === item.id ? 'dragging' : ''}`}
            onMouseDown={(e) => handleMouseDown(e, item)}
            style={{ '--item-color': item.color }}
          >
            <div className="drag-handle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 4h2v2h-2V4zm0 10h2v2h-2v-2zm0-5h2v2h-2v-2zm-5 5h2v2H6v-2zm0-5h2v2H6v-2zm0-5h2v2H6V4zm10 10h2v2h-2v-2zm0-5h2v2h-2v-2zm0-5h2v2h-2V4z"/>
              </svg>
            </div>
            <div className="item-content">{item.content}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
