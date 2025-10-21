import express from 'express'
import { supabase } from '../db.js'

const router = express.Router()

router.get('/highlights', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .eq('highlighted', true)

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

export default router
