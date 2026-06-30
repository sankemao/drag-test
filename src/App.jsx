import { useState, useRef, useCallback } from 'react'
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
  const itemPositionsRef = useRef([])

  // FLIP 核心：拍摄快照（纯粹在原生 DOM 层面工作，不依赖当前 React 状态）
  const getDOMRects = (currentElements) => {
    const rects = new Map()
    currentElements.forEach(el => {
      const id = el.getAttribute('data-id')
      if (id) rects.set(id, el.getBoundingClientRect())
    })
    return rects
  }

  // FLIP 核心：直接对发生物理交换的 DOM 节点施加过渡动画
  const applyFLIPToDOM = (firstRects, currentElements, currentDraggingId) => {
    const lastRects = getDOMRects(currentElements)

    currentElements.forEach(el => {
      const id = el.getAttribute('data-id')
      if (!id) return

      const first = firstRects.get(id)
      const last = lastRects.get(id)

      if (first && last) {
        const deltaY = first.top - last.top

        if (deltaY !== 0) {
          // 如果是正在被拖拽的真身的占位符，保持隐藏，不需要避让动画
          if (id === String(currentDraggingId)) {
            el.style.transition = 'none'
            el.style.transform = ''
            return
          }

          // 避让的兄弟元素：瞬间推回旧位置
          el.style.transition = 'none'
          el.style.transform = `translateY(${deltaY}px)`

          // 强刷单个 DOM 的排版重绘
          el.getBoundingClientRect()

          // 激活过渡，使其平滑滑行到物理新坑位
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

    // 固化初始各个坑位的绝对中心点，作为 mousemove 判定的静态参考
    const children = Array.from(listRef.current.children)
    itemPositionsRef.current = children.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        element: el,
        id: el.getAttribute('data-id'),
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

      const ghostTop = moveEvent.clientY - dragOffsetRef.current.y
      ghostElRef.current.style.left = (moveEvent.clientX - dragOffsetRef.current.x) + 'px'
      ghostElRef.current.style.top = ghostTop + 'px'

      const ghostCenterY = ghostTop + itemRect.height / 2
      
      const currentChildren = Array.from(listRef.current.children)
      const currentIndex = currentChildren.indexOf(itemEl)
      
      let targetElement = null

      // 【向下物理检测】判断是否越过了 HTML 树中下一个元素的初始中心点
      if (currentIndex < currentChildren.length - 1) {
        const nextEl = currentChildren[currentIndex + 1]
        const nextOriginalPos = itemPositionsRef.current.find(p => p.element === nextEl)
        if (nextOriginalPos && ghostCenterY > nextOriginalPos.center) {
          targetElement = nextEl
        }
      }

      // 【向上物理检测】判断是否越过了 HTML 树中上一个元素的初始中心点
      if (currentIndex > 0 && !targetElement) {
        const prevEl = currentChildren[currentIndex - 1]
        const prevOriginalPos = itemPositionsRef.current.find(p => p.element === prevEl)
        if (prevOriginalPos && ghostCenterY < prevOriginalPos.center) {
          targetElement = prevEl
        }
      }

      // 🔥 【核心优化点】：直接操作底层原生 DOM，跳过 React 状态更新！
      if (targetElement) {
        // FLIP: First
        const firstRects = getDOMRects(currentChildren)

        // 判断是向上移还是向下移，并用 insertBefore 改变 DOM 树的真实节点顺序
        if (currentChildren.indexOf(targetElement) > currentIndex) {
          // 向下移：把当前项插到目标项的下一个兄弟节点前面
          listRef.current.insertBefore(itemEl, targetElement.nextSibling)
        } else {
          // 向上移：把当前项插到目标项的前面
          listRef.current.insertBefore(itemEl, targetElement)
        }

        // FLIP: Last, Invert & Play
        const updatedChildren = Array.from(listRef.current.children)
        applyFLIPToDOM(firstRects, updatedChildren, item.id)
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      const ghost = ghostElRef.current
      if (!ghost || !listRef.current) return

      const finalRect = itemEl.getBoundingClientRect()
      ghost.style.transition = 'left 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)'
      ghost.style.left = finalRect.left + 'px'
      ghost.style.top = finalRect.top + 'px'

      setTimeout(() => {
        if (ghostElRef.current) {
          ghostElRef.current.remove()
          ghostElRef.current = null
        }
        
        itemEl.style.visibility = ''
        
        // 恢复所有兄弟节点的 Transition 样式
        Array.from(listRef.current.children).forEach(el => {
          el.style.transition = ''
        })

        // 🎉 【大结局】：拖拽彻底结束后，只在最后这一刹那，统一同步一次 React 状态
        const finalChildren = Array.from(listRef.current.children)
        const finalItemsOrder = finalChildren.map(el => {
          const id = Number(el.getAttribute('data-id'))
          return initialItems.find(it => it.id === id) // 这里的 initialItems 也可以换成 items 闭包，但因为中途没改过，它们是一致的
        }).filter(Boolean)

        setItems(finalItemsOrder)
        setDraggingId(null)
        itemPositionsRef.current = []
      }, 250)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  return (
    <div className="app">
      <h1>极致微操：纯 DOM 操作 + FLIP 避让</h1>
      <p className="description">拖拽中途 0 次 React 重绘，放手时一次性数据对齐</p>
      <ul ref={listRef} className="draggable-list">
        {items.map((item) => (
          <li
            key={item.id}
            data-id={item.id} // 必须加 data-id 供原生 DOM 操作识别
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