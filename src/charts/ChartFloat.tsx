import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ChartManager, ChartSeriesData } from './chartManager'
import type { ChartDef } from './chartTypes'
import { t } from '../i18n/i18n'

// The float-DOM component Univer mounts for each chart. It needs the manager
// singleton — bound once at boot (module scope, same pattern Univer examples use).
let managerRef: ChartManager | null = null
export function bindChartManager(manager: ChartManager) {
  managerRef = manager
}

const btnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  lineHeight: '20px',
  padding: 0,
  border: '1px solid #d9d9d9',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 12
}

export function buildOption(def: ChartDef, data: ChartSeriesData): echarts.EChartsOption {
  const title = def.title ? { text: def.title, left: 'center', textStyle: { fontSize: 13 } } : undefined
  if (def.kind === 'pie') {
    const first = data.series[0]
    return {
      title,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: '62%',
          center: ['50%', '56%'],
          data: data.categories.map((name, i) => ({ name, value: first?.values[i] ?? 0 }))
        }
      ]
    }
  }
  return {
    title,
    tooltip: { trigger: 'axis' },
    legend: data.series.length > 1 ? { bottom: 0, type: 'scroll' } : undefined,
    grid: { left: 40, right: 16, top: def.title ? 34 : 16, bottom: data.series.length > 1 ? 32 : 24 },
    xAxis: { type: 'category', data: data.categories },
    yAxis: { type: 'value' },
    series: data.series.map((s) => ({
      type: def.kind === 'bar' ? 'bar' : 'line',
      name: s.name,
      data: s.values,
      smooth: def.kind !== 'bar',
      areaStyle: def.kind === 'area' ? {} : undefined
    }))
  }
}

export function ChartFloat(props: { data?: { chartId?: string } }) {
  const chartId = props.data?.chartId
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = divRef.current
    if (!chartId || !managerRef || !el) return
    const manager = managerRef
    const chart = echarts.init(el)
    const render = () => {
      const def = manager.getDef(chartId)
      if (!def) return
      chart.setOption(buildOption(def, manager.getData(chartId)), true)
    }
    render()
    const unsubscribe = manager.subscribe(chartId, render)
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(el)
    return () => {
      unsubscribe()
      observer.disconnect()
      chart.dispose()
    }
  }, [chartId])

  return (
    <div
      className="exelmj-chart-root"
      style={{
        position: 'absolute',
        inset: 0,
        background: '#fff',
        border: '1px solid #d9d9d9',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,.15)',
        overflow: 'hidden'
      }}
    >
      <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 4, insetInlineEnd: 4, display: 'flex', gap: 4, zIndex: 2 }}>
        <button
          type="button"
          title={t('chartEdit')}
          style={btnStyle}
          onClick={() => chartId && managerRef?.requestEdit(chartId)}
        >
          ✎
        </button>
        <button
          type="button"
          title={t('chartDelete')}
          style={btnStyle}
          onClick={() => chartId && managerRef?.remove(chartId)}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
