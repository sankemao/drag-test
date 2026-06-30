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
  const ghostElRef = useRef(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  
  // 核心：静态影子坐标追踪
  const itemsRef = useRef(items)
  const itemPositionsRef = useRef([]) // 存储初始各个坑位的绝对中线，防止重排引起抖动

  itemsRef.current = items

  // FLIP: 获取当前所有 DOM 节点的快照位置
  const getRects = () => {
    const rects = {}
    itemsRef.current.forEach(item => {
      const el = itemRefs.current[item.id]
      if (el) rects[item.id] = el.getBoundingClientRect()
    })
    return rects
  }

  // FLIP: 播放顺滑的避让动画
  const applyFLIP = (firstRects, currentDraggingId) => {
    const lastRects = getRects()

    itemsRef.current.forEach(item => {
      const el = itemRefs.current[item.id]
      if (!el) return

      const first = firstRects[item.id]
      const last = lastRects[item.id]

      if (first && last) {
        const deltaY = first.top - last.top

        if (deltaY !== 0) {
          if (item.id === currentDraggingId) {
            el.style.transition = 'none'
            el.style.transform = ''
            return
          }

          // 动效补偿：先推回，再滑行
          el.style.transition = 'none'
          el.style.transform = `translateY(${deltaY}px)`

          // 强刷重绘
          el.getBoundingClientRect()

          el.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)'
          el.style.transform = ''
        }
      }
    })
  }

  const handleMouseDown = useCallback((e, item) => {
    e.preventDefault()
    
    const itemEl = itemRefs.current[item.id]
    if (!itemEl || !listRef.current) return

    const itemRect = itemEl.getBoundingClientRect()
    
    dragOffsetRef.current = {
      x: e.clientX - itemRect.left,
      y: e.clientY - itemRect.top
    }

    // 【核心修复点 1】：在拖拽开始的这一瞬间，一口气把所有列表项当前的“初始物理中线”固化下来。
    // 后续的 mousemove 只跟这组绝对死数据做对比，绝对不会因为数据重排而导致判定范围产生漂移！
    itemPositionsRef.current = itemsRef.current.map((it) => {
      const el = itemRefs.current[it.id]
      const rect = el.getBoundingClientRect()
      return {
        id: it.id,
        top: rect.top,
        bottom: rect.bottom,
        center: rect.top + rect.height / 2
      }
    })

    setDraggingId(item.id)
    itemEl.style.visibility = 'hidden'

    // 创建随动影子
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.style.left = itemRect.left + 'px'
    ghost.style.top = itemRect.top + 'px'
    ghost.style.width = itemRect.width + 'px'
    ghost.style.setProperty('--item-color', item.color)
    ghost.innerHTML = itemEl.innerHTML
    document.body.appendChild(ghost)
    ghostElRef.current = ghost

    const handleMouseMove = (moveEvent) => {
      if (!ghostElRef.current || !listRef.current) return

      const ghostLeft = moveEvent.clientX - dragOffsetRef.current.x
      const ghostTop = moveEvent.clientY - dragOffsetRef.current.y
      ghostElRef.current.style.left = ghostLeft + 'px'
      ghostElRef.current.style.top = ghostTop + 'px'

      const ghostCenterY = ghostTop + itemRect.height / 2
      
      // 当前拖拽项在最新 items 数组中的索引
      const currentIndex = itemsRef.current.findIndex(it => it.id === item.id)
      
      // 【核心修复点 2】：不再全局循环盲测。而是精准只和它的“上一个坑位”或“下一个坑位”的虚拟中线进行判定
      let targetIndex = -1

      // 尝试向下拖拽：如果越过了下方坑位的中线位置
      if (currentIndex < itemsRef.current.length - 1) {
        const nextItemInArray = itemsRef.current[currentIndex + 1]
        const nextItemOriginalPos = itemPositionsRef.current.find(p => p.id === nextItemInArray.id)
        if (nextItemOriginalPos && ghostCenterY > nextItemOriginalPos.center) {
          targetIndex = currentIndex + 1
        }
      }

      // 尝试向上拖拽：如果越过了上方坑位的中线位置
      if (currentIndex > 0 && targetIndex === -1) {
        const prevItemInArray = itemsRef.current[currentIndex - 1]
        const prevItemOriginalPos = itemPositionsRef.current.find(p => p.id === prevItemInArray.id)
        if (prevItemOriginalPos && ghostCenterY < prevItemOriginalPos.center) {
          targetIndex = currentIndex - 1
        }
      }

      // 如果跨越了中线边界，立刻触发颠倒重排并施加 FLIP
      if (targetIndex !== -1) {
        const firstRects = getRects()

        const newItems = [...itemsRef.current]
        const [draggedItem] = newItems.splice(currentIndex, 1)
        newItems.splice(targetIndex, 0, draggedItem)

        flushSync(() => {
          setItems(newItems)
        })

        applyFLIP(firstRects, item.id)
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      const ghost = ghostElRef.current
      if (!ghost || !listRef.current) return

      const finalEl = itemRefs.current[item.id]
      if (finalEl) {
        const finalRect = finalEl.getBoundingClientRect()
        ghost.style.transition = 'left 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)'
        ghost.style.left = finalRect.left + 'px'
        ghost.style.top = finalRect.top + 'px'
      }

      setTimeout(() => {
        if (ghostElRef.current) {
          ghostElRef.current.remove()
          ghostElRef.current = null
        }
        
        const el = itemRefs.current[item.id]
        if (el) el.style.visibility = ''
        
        setDraggingId(null)
        itemPositionsRef.current = [] // 释放内存
      }, 250)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  return (
    <div className="app">
      <h1>终极稳健：静态索引 + FLIP 避让</h1>
      <p className="description">彻底解决了动态高度在重排时的判定区漂移和闪烁 Bug</p>
      <ul ref={listRef} className="draggable-list">
        {items.map((item) => (
          <li
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current[item.id] = el
              else delete itemRefs.current[item.id]
            }}
            className={`draggable-item ${draggingId === item.id ? 'dragging' : ''}`}
            style={{ '--item-color': item.color }}
          >
            <div className="drag-handle" onMouseDown={(e) => handleMouseDown(e, item)}>
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