import React, { useEffect } from 'react'

function ConfirmModal({ title = 'Confirm', message = '', confirmText = 'Yes', cancelText = 'Cancel', onConfirm, onCancel, show }){
  useEffect(()=>{
    if (!show) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return ()=>{ document.body.style.overflow = prev }
  }, [show])

  if (!show) return null

  return (
    <div className="confirm-modal-backdrop" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1050, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onCancel}>
      <div className="confirm-modal" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:8, maxWidth:420, width:'90%', padding:20, boxShadow:'0 6px 24px rgba(0,0,0,0.2)' }}>
        <div style={{ marginBottom:12 }}>
          <strong style={{ fontSize:16 }}>{title}</strong>
        </div>
        <div style={{ marginBottom:18, color:'#333' }}>{message}</div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button className="btn btn-sm btn-outline-secondary" onClick={onCancel}>{cancelText}</button>
          <button className="btn btn-sm btn-danger" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
