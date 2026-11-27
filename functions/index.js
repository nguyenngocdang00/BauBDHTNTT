const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { createHash, randomBytes } = require('node:crypto')

initializeApp()
const db = getFirestore()
const ELECTION_ID = 'current'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const hashText = value => createHash('sha256').update(value).digest('hex')
const createLoginCode = () => {
  const bytes = randomBytes(12)
  const raw = [...bytes].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

async function assertAdmin(uid) {
  const snap = await db.doc(`users/${uid}`).get()
  if (!snap.exists || snap.data().active !== true || snap.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Chỉ admin đoàn mới được thực hiện thao tác này.')
  }
}

async function applyCodeRateLimit(request) {
  const ip = request.rawRequest?.ip || 'unknown'
  const ref = db.doc(`loginCodeAttempts/${hashText(ip)}`)
  const now = Date.now()
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const data = snap.exists ? snap.data() : {}
    const withinWindow = data.windowStartedAt && now - data.windowStartedAt.toMillis() < 15 * 60 * 1000
    const count = withinWindow ? (data.count || 0) : 0
    if (count >= 500) throw new HttpsError('resource-exhausted', 'Có quá nhiều lần thử từ mạng này. Vui lòng đợi 15 phút rồi thử lại.')
    tx.set(ref, { count: count + 1, windowStartedAt: withinWindow ? data.windowStartedAt : new Date(now) })
  })
}

exports.issueLoginCode = onCall(async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập tài khoản admin.')
  await assertAdmin(request.auth.uid)
  const targetUid = request.data?.uid
  if (typeof targetUid !== 'string' || !targetUid) throw new HttpsError('invalid-argument', 'Thiếu tài khoản HDT.')
  const code = createLoginCode()
  const codeHash = hashText(code)
  const userRef = db.doc(`users/${targetUid}`)
  const newCodeRef = db.doc(`loginCodes/${codeHash}`)
  await db.runTransaction(async tx => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists || userSnap.data().active !== true || userSnap.data().role === 'admin') {
      throw new HttpsError('failed-precondition', 'Chỉ cấp mã cho tài khoản HDT đang hoạt động.')
    }
    const previousHash = userSnap.data().loginCodeHash
    if (previousHash) tx.delete(db.doc(`loginCodes/${previousHash}`))
    tx.create(newCodeRef, { uid: targetUid, active: true, issuedAt: FieldValue.serverTimestamp() })
    tx.update(userRef, { loginCodeHash: codeHash, loginCodeIssuedAt: FieldValue.serverTimestamp() })
  })
  return { code, name: (await userRef.get()).data()?.name || '' }
})

exports.redeemLoginCode = onCall(async request => {
  await applyCodeRateLimit(request)
  const code = String(request.data?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(code)) {
    throw new HttpsError('permission-denied', 'Mã đăng nhập không đúng hoặc đã bị thu hồi. Hãy nhờ admin cấp mã mới.')
  }
  const codeHash = hashText(code)
  const codeRef = db.doc(`loginCodes/${codeHash}`)
  let uid = null
  await db.runTransaction(async tx => {
    const codeSnap = await tx.get(codeRef)
    if (!codeSnap.exists || codeSnap.data().active !== true) {
      throw new HttpsError('permission-denied', 'Mã đăng nhập không đúng hoặc đã bị thu hồi. Hãy nhờ admin cấp mã mới.')
    }
    uid = codeSnap.data().uid
    const userRef = db.doc(`users/${uid}`)
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists || userSnap.data().active !== true || userSnap.data().loginCodeHash !== codeHash) {
      throw new HttpsError('permission-denied', 'Tài khoản không hoạt động hoặc mã đã bị thu hồi.')
    }
    tx.update(userRef, { lastLoginAt: FieldValue.serverTimestamp() })
  })
  const token = await getAuth().createCustomToken(uid)
  return { token }
})

exports.claimPhoneVoter = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Vui lòng xác minh số điện thoại.')
  const phone = request.auth.token.phone_number
  if (!phone) throw new HttpsError('permission-denied', 'Tài khoản chưa xác minh số điện thoại.')
  const allowRef = db.doc(`voterPhones/${phone}`)
  const userRef = db.doc(`users/${request.auth.uid}`)
  await db.runTransaction(async tx => {
    const [allowSnap, userSnap] = await tx.getAll(allowRef, userRef)
    if (userSnap.exists) return
    if (!allowSnap.exists || allowSnap.data().active !== true) {
      throw new HttpsError('permission-denied', 'Số điện thoại chưa được admin đăng ký trong danh sách HDT.')
    }
    const voter = allowSnap.data()
    tx.create(userRef, {
      name: voter.name || request.auth.token.name || '',
      phone,
      sector: voter.sector || '',
      active: true,
      role: 'voter',
      createdAt: FieldValue.serverTimestamp(),
    })
  })
  return { ok: true }
})

exports.submitBallot = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập.')
  const uid = request.auth.uid
  const { round, candidateIds } = request.data || {}
  if (![1, 2].includes(round) || !Array.isArray(candidateIds)) {
    throw new HttpsError('invalid-argument', 'Phiếu bầu không hợp lệ.')
  }
  const uniqueIds = [...new Set(candidateIds)]
  const requiredCount = round === 1 ? 11 : 5
  if (candidateIds.length !== requiredCount || uniqueIds.length !== requiredCount) {
    throw new HttpsError('invalid-argument', `Vòng ${round} cần chọn đúng ${requiredCount} người.`)
  }

  const userRef = db.doc(`users/${uid}`)
  const electionRef = db.doc(`elections/${ELECTION_ID}`)
  const ballotRef = db.doc(`elections/${ELECTION_ID}/ballots/${uid}/rounds/${round}`)
  const candidateRefs = uniqueIds.map(id => db.doc(`elections/${ELECTION_ID}/candidates/${id}`))
  const tallyRefs = uniqueIds.map(id => db.doc(`elections/${ELECTION_ID}/tallies/round${round}/candidates/${id}`))

  await db.runTransaction(async tx => {
    const [userSnap, electionSnap, ballotSnap, ...candidateSnaps] = await tx.getAll(userRef, electionRef, ballotRef, ...candidateRefs)
    if (!userSnap.exists || userSnap.data().active !== true) throw new HttpsError('permission-denied', 'Tài khoản chưa được admin duyệt vào danh sách HDT.')
    if (!electionSnap.exists) throw new HttpsError('failed-precondition', 'Admin chưa tạo kỳ bầu cử.')
    const election = electionSnap.data()
    if (election.status !== 'open' || election.activeRound !== round) throw new HttpsError('failed-precondition', 'Vòng bầu cử hiện không mở.')
    if (election.endsAt && election.endsAt.toMillis() <= Date.now()) throw new HttpsError('deadline-exceeded', 'Đã hết thời gian bỏ phiếu.')
    if (ballotSnap.exists) throw new HttpsError('already-exists', 'Bạn đã bỏ phiếu ở vòng này.')
    const invalidCandidate = candidateSnaps.some((snap, index) => !snap.exists || snap.data().active === false || (round === 2 && snap.data().electedRound1 !== true))
    if (invalidCandidate) throw new HttpsError('invalid-argument', 'Danh sách có ứng viên không hợp lệ cho vòng này.')

    tx.create(ballotRef, {
      round,
      voterUid: uid,
      voterName: userSnap.data().name || request.auth.token.name || '',
      candidateIds: uniqueIds,
      submittedAt: FieldValue.serverTimestamp(),
    })
    tx.update(electionRef, { [`round${round}VotedCount`]: FieldValue.increment(1) })
    tx.set(userRef, { [`round${round}Voted`]: true }, { merge: true })
    candidateSnaps.forEach((snap, index) => {
      tx.set(tallyRefs[index], {
        candidateId: uniqueIds[index],
        votes: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    })
  })
  return { ok: true, round }
})
