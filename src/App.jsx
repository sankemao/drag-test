import { useState, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import './App.css'

// 初始列表数据，包含不同长度的内容以测试可变高度
const initialItems = [
  { id: 1, content: '第一项 - 这是一个较短的项目', color: '#6366f1' },
  { id: 2, content: '第二项 - 这个项目的内容比较长，高度会更高一些，测试不同高度的元素是否能正确排序', color: '#8b5cf6' },
  { id: 3, content: '第三项', color: '#ec4899' },
  { id: 4, content: '第四项 - 这是一个中等长度的项目内容，用于测试不同高度的元素拖拽', color: '#f59e0b' },
  { id: 5, content: '第五项', color: '#10b981' },
  { id: 6, content: '第六项 - 这个项目内容非常长，用来测试多行文本的高度是否能被正确计算和处理', color: '#06b6d4' },
]

function App() {
  // 列表数据状态，拖拽结束后更新
  const [items, setItems] = useState(initialItems)
  // 当前正在拖拽的元素ID（仅用于渲染时添加拖拽状态类）
  const [draggingId, setDraggingId] = useState(null)
  
  // 列表容器引用
  const listRef = useRef(null)
  // 各列表项DOM引用映射 {id: element}
  const itemRefs = useRef({})
  // 拖拽过程中的坐标缓存 {id, height, offsetY, top, center}
  const coordsRef = useRef([])
  // 鼠标相对于拖拽元素左上角的偏移量
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  // 拖拽时的幽灵元素引用
  const ghostElRef = useRef(null)

  /**
   * 重新计算所有元素的顶部位置和中心点位置
   * @param {number} gap - 元素间距（默认8px）
   */
  const recalcCoords = useCallback((gap = 8) => {
    let y = 0
    coordsRef.current.forEach((coord) => {
      coord.top = y
      coord.center = y + coord.height / 2
      y += coord.height + gap
    })
  }, [])

  /**
   * 交换两个坐标对象的位置
   * @param {number} idx1 - 第一个索引
   * @param {number} idx2 - 第二个索引
   */
  const swapCoords = useCallback((idx1, idx2) => {
    const temp = coordsRef.current[idx1]
    coordsRef.current[idx1] = coordsRef.current[idx2]
    coordsRef.current[idx2] = temp
  }, [])

  /**
   * 更新指定元素的transform样式
   * @param {number} id - 元素ID
   * @param {number} offsetY - Y轴偏移量
   */
  const updateItemTransform = useCallback((id, offsetY) => {
    const el = itemRefs.current[id]
    if (el) {
      el.style.transform = `translateY(${offsetY}px)`
    }
  }, [])

  /**
   * 鼠标按下事件处理 - 开始拖拽
   * @param {MouseEvent} e - 鼠标事件
   * @param {Object} item - 当前拖拽的列表项数据
   */
  const handleMouseDown = useCallback((e, item) => {
    e.preventDefault()
    
    const itemEl = itemRefs.current[item.id]
    // 立即隐藏原元素，避免残影
    itemEl.style.visibility = 'hidden'
    
    const itemRect = itemEl.getBoundingClientRect()
    const listRect = listRef.current.getBoundingClientRect()
    
    // 初始化坐标数据：记录每个元素的高度和初始偏移
    coordsRef.current = items.map((it) => {
      const el = itemRefs.current[it.id]
      const rect = el.getBoundingClientRect()
      return {
        id: it.id,
        height: rect.height,
        offsetY: 0
      }
    })
    
    // 计算初始top和center位置
    recalcCoords()
    
    // 记录鼠标相对于元素左上角的偏移（用于保持鼠标在ghost中的位置不变）
    dragOffsetRef.current = {
      x: e.clientX - itemRect.left,
      y: e.clientY - itemRect.top
    }
    
    // 更新拖拽状态
    setDraggingId(item.id)
    
    // 创建幽灵元素（跟随鼠标移动）
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.style.left = itemRect.left + 'px'
    ghost.style.top = itemRect.top + 'px'
    ghost.style.width = itemRect.width + 'px'
    ghost.style.setProperty('--item-color', item.color)
    ghost.innerHTML = itemEl.innerHTML
    document.body.appendChild(ghost)
    ghostElRef.current = ghost
    
    /**
     * 鼠标移动事件处理 - 拖拽过程中
     */
    const handleMouseMove = (e) => {
      const ghost = ghostElRef.current
      if (!ghost) return
      
      // 更新幽灵元素位置
      const ghostLeft = e.clientX - dragOffsetRef.current.x
      const ghostTop = e.clientY - dragOffsetRef.current.y
      ghost.style.left = ghostLeft + 'px'
      ghost.style.top = ghostTop + 'px'
      
      // 计算ghost相对于列表容器顶部的位置
      const ghostTopRel = ghostTop - listRect.top
      
      // 循环检测是否需要交换位置（支持一次移动多个位置）
      let swapped = true
      while (swapped) {
        swapped = false
        const currentIndex = coordsRef.current.findIndex(c => c.id === item.id)
        if (currentIndex === -1) break
        
        const currentCoord = coordsRef.current[currentIndex]
        const ghostBottomRel = ghostTopRel + currentCoord.height
        
        // 向下拖拽：检测是否超过下一个元素的中心点
        if (currentIndex < coordsRef.current.length - 1) {
          const nextCoord = coordsRef.current[currentIndex + 1]
          if (ghostBottomRel > nextCoord.center) {
            const movingDistance = currentCoord.height + 8
            
            // 下一个元素向上移动避让
            nextCoord.offsetY -= movingDistance
            updateItemTransform(nextCoord.id, nextCoord.offsetY)
            
            // 交换坐标位置
            swapCoords(currentIndex, currentIndex + 1)
            recalcCoords()
            
            swapped = true
            continue
          }
        }
        
        // 向上拖拽：检测是否超过上一个元素的中心点
        if (currentIndex > 0) {
          const prevCoord = coordsRef.current[currentIndex - 1]
          if (ghostTopRel < prevCoord.center) {
            const movingDistance = currentCoord.height + 8
            
            // 上一个元素向下移动避让
            prevCoord.offsetY += movingDistance
            updateItemTransform(prevCoord.id, prevCoord.offsetY)
            
            // 交换坐标位置
            swapCoords(currentIndex, currentIndex - 1)
            recalcCoords()
            
            swapped = true
            continue
          }
        }
      }
    }
    
    /**
     * 鼠标松开事件处理 - 结束拖拽
     */
    const handleMouseUp = () => {
      // 移除全局事件监听
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      const ghost = ghostElRef.current
      if (!ghost) return
      
      // 获取当前拖拽元素在坐标数组中的位置
      const currentIndex = coordsRef.current.findIndex(c => c.id === item.id)
      if (currentIndex === -1) {
        ghost.remove()
        ghostElRef.current = null
        setDraggingId(null)
        return
      }
      
      // 计算幽灵元素最终目标位置
      const listRect = listRef.current.getBoundingClientRect()
      const targetCoord = coordsRef.current[currentIndex]
      const targetTop = targetCoord.top + listRect.top + targetCoord.offsetY
      const targetLeft = listRect.left
      
      // 添加过渡动画，让幽灵元素平滑移动到目标位置
      ghost.style.transition = 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      ghost.style.left = targetLeft + 'px'
      ghost.style.top = targetTop + 'px'
      
      // 等待动画结束后清理
      setTimeout(() => {
        // 移除幽灵元素
        if (ghostElRef.current) {
          ghostElRef.current.remove()
          ghostElRef.current = null
        }
        
        // 临时禁用过渡，防止React重排时出现跳动
        Object.values(itemRefs.current).forEach(el => {
          if (el) el.style.transition = 'none'
        })
        
        // 根据最终坐标顺序生成新的列表数据
        const newItems = coordsRef.current.map(coord => 
          items.find(it => it.id === coord.id)
        ).filter(Boolean)
        
        // 同步更新状态（确保DOM立即重排）
        flushSync(() => {
          setItems(newItems)
          setDraggingId(null)
        })
        
        // 清理所有元素的transform和visibility
        Object.values(itemRefs.current).forEach(el => {
          if (el) {
            el.style.transform = ''
            el.style.visibility = ''
          }
        })
        
        // 清空坐标缓存
        coordsRef.current = []
        
        // 恢复过渡效果
        setTimeout(() => {
          Object.values(itemRefs.current).forEach(el => {
            if (el) el.style.transition = ''
          })
        }, 50)
      }, 300)
    }
    
    // 添加全局事件监听
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [items, recalcCoords, swapCoords, updateItemTransform])

  /**
   * 列表项ref回调 - 注册DOM引用
   * @param {HTMLElement} el - DOM元素
   * @param {Object} item - 列表项数据
   */
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
