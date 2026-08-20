import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { IconCheck, IconCross, IconReview } from '../components/Icons'
import { useNotification } from '../components/NotificationContext'

export function ReviewsPage() {
  const { caps } = useAuth()
  const { currentProject } = useProject()
  const { prompt, toast } = useNotification()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!caps.canReviewTasks) return
    setLoading(true)
    let query = supabase
      .from('tasks')
      .select('id, activity, zone, percent_complete, project_id, review_requested_at, assignee_id, rejection_comment')
      .eq('pending_review', true)
      .order('review_requested_at', { ascending: false })

    if (currentProject?.id) {
      query = query.eq('project_id', currentProject.id)
    }

    const { data, error: err } = await query
    if (err) setError(err.message)
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [currentProject?.id, caps.canReviewTasks])

  async function approve(id) {
    const { error: err } = await supabase
      .from('tasks')
      .update({
        pending_review: false,
        status: 'Completed',
        percent_complete: 100,
        rejection_comment: null,
      })
      .eq('id', id)
    if (err) setError(err.message)
    else {
      toast.success('Task Approved', 'Task has been approved and marked as Completed (100%).')
      await load()
    }
  }

  async function reject(id) {
    const comment = await prompt({
      title: 'Request Revision',
      message: 'Provide revision notes for the engineer. This will be recorded on the task.',
      placeholder: 'e.g. Verify drawing reference, re-check weld symbols…',
      defaultValue: '',
      confirmText: 'Send Revision',
      cancelText: 'Cancel',
    })
    if (comment === null) return // user cancelled
    const { error: err } = await supabase
      .from('tasks')
      .update({
        pending_review: false,
        rejection_comment: comment || 'Corrections required',
        status: 'In Progress',
      })
      .eq('id', id)
    if (err) setError(err.message)
    else {
      toast.info('Revision Requested', 'Task has been returned for corrections.')
      await load()
    }
  }

  if (!caps.canReviewTasks) {
    return (
      <div className="pm-panel" style={{ textAlign: 'center', padding: '40px' }}>
        <IconReview size={32} className="muted" />
        <h3 style={{ marginTop: '12px' }}>Review Requests</h3>
        <p className="muted">
          Your role does not have authorization to approve reviews. Submit reviews directly from your task grid.
        </p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className={`pm-hero shell-${caps.shell}`}>
        <h2>Engineering Review Queue</h2>
        <p className="muted">
          Pending sign-off requests for Vessel <strong>{currentProject?.ship_id || 'All'}</strong>
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading pending review items…</p>
      ) : items.length === 0 ? (
        <div className="pm-panel" style={{ textAlign: 'center', padding: '40px' }}>
          <IconCheck size={32} style={{ color: 'var(--success)' }} />
          <h3 style={{ marginTop: '12px' }}>Review Queue Empty</h3>
          <p className="muted">All submitted engineering tasks have been reviewed and approved.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map((t) => (
            <li
              key={t.id}
              className="pm-panel"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div>
                <strong style={{ fontSize: '14px' }}>{t.activity || 'Untitled Task'}</strong>
                <p className="muted" style={{ marginTop: '2px' }}>
                  Zone: {t.zone || '—'} · Requested Progress: <strong>{t.percent_complete ?? 0}%</strong> ·{' '}
                  {t.review_requested_at ? new Date(t.review_requested_at).toLocaleString() : ''}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="pm-btn success" onClick={() => approve(t.id)}>
                  <IconCheck size={14} />
                  <span>Approve (100%)</span>
                </button>
                <button type="button" className="pm-btn danger" onClick={() => reject(t.id)}>
                  <IconCross size={14} />
                  <span>Request Revision</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
