'use strict'
// ============================================================================
// atum-tracking.cjs
// Purpose  : Supabase agent usage tracking (KPI stats — fire & forget)
// Owner    : Aymeric
// ============================================================================

const _SUPA_URL = 'https://ataxqfqlprndcjisepbn.supabase.co'
const _SUPA_KEY = 'sb_publishable_qZMWIStnnUbnmdVxKB4DyA_Bpj10XoY'

const _AGENT_NAMES = {
  'atum': 'Tom', 'atum-diagnostic': 'John', 'atum-analyse': 'Olivier',
  'atum-offre': 'Silvia', 'nathan': 'N8than', 'fabrice': 'Fabrice',
  'christian': 'Christian', 'frank': 'Frank', 'sophie': 'Sophie',
  'norman': 'Norman', 'magali': 'Magalie', 'catalin': 'Catalin',
  'lionel': 'Lionel', 'axelle': 'Axelle', 'aziza': 'Aziza',
  'julie': 'Julie', 'josie': 'Julie', 'max': 'Max',
  'telos': 'Telos', 'stellar': 'Stellar', 'irma': 'Irma',
  'victor': 'Victor', 'anas': 'Anas',
}

function recordAgentUsage(agentId, userPrenom, userSociete) {
  if (!agentId) return
  const agent_name = _AGENT_NAMES[agentId.toLowerCase()] || agentId
  const payload = { agent_id: agentId, agent_name }
  if (userPrenom)  payload.user_prenom  = userPrenom
  if (userSociete) payload.user_societe = userSociete
  fetch(_SUPA_URL + '/rest/v1/agent_usage', {
    method: 'POST',
    headers: {
      'apikey': _SUPA_KEY,
      'Authorization': 'Bearer ' + _SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

module.exports = { recordAgentUsage }
