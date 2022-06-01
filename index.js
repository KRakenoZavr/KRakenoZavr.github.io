/********      QUERIES BEGIN        ********/
const queryGetUserID = `
query {
  user(where: { login: { _eq: "KRaken" } }) {
    id
    login
  }
}`

const queryProgressesByUserId = `
query ($userId: Int, $offset: Int) {
  progress(
    where: {
      userId: { _eq: $userId }
      isDone: { _eq: true }
      object: { type: { _eq: "project" } }
      grade: { _gt: 0 }
    }
    offset: $offset
    distinct_on: objectId
  ) {
    object {
      id
      name
      type
    }
    userId
    grade
    path
    createdAt
    updatedAt
    isDone
  }
}`

const queryTransactionByObjectID = `
query ($objectId: Int, $userId: Int) {
  transaction(
    order_by: { amount: desc }
    where: {
      objectId: { _eq: $objectId }
      type: { _eq: "xp" }
      user: { id: { _eq: $userId } }
    }
  ) {
    type
    amount
    object {
      name
    }
    createdAt
  }
}`
/*******      QUERIES END         *******/

/******      FETCHER START     ******/
const fetcher = async (query, variables = null) => {
    try {
        const response = await fetch(GRAPHQL_URL, {
            method: 'POST',
            body: JSON.stringify({query, variables}),
        })

        return checkRespone(await response.json())
    } catch (e) {
        console.warn('fetcher fail:\n', e)
        return null
    }
}

const checkRespone = (resp) => {
    if (Object.hasOwnProperty.call(resp, 'data')) {
        return resp.data
    } else if (Object.hasOwnProperty.call(resp, 'errors')) {
        console.warn('error from response:\n', resp.errors)
        return null
    }
}
/******      FETCHER END     ******/

/*******      CONSTANTS BEGIN     *******/
const QUERIES = {
    getUserId: {
        query: queryGetUserID,
    },
    progressByUserId: {
        query: queryProgressesByUserId,
        variables: (userId, offset) => ({userId, offset}),
    },
    transactionByObjectID: {
        query: queryTransactionByObjectID,
        variables: (objectId, userId) => ({objectId, userId}),
    },
}
const FETCHER = {
    getUserId: async () => {
        const res = await fetcher(QUERIES.getUserId.query)
        if (!res) return null
        return res.user[0].id
    },
    progressByUserId: async (userId) => {
        let progress = []
        while (true) {
            const res = await fetcher(
                QUERIES.progressByUserId.query,
                QUERIES.progressByUserId.variables(userId, progress.length)
            )

            if (!res) return progress

            progress = [...progress, ...res.progress]
            if (res.progress.length !== 50) {
                break
            }
        }

        return progress
    },
    transactionByObjectID: async (objectId, userId) => {
        let transactions = []
        while (true) {
            const res = await fetcher(
                QUERIES.transactionByObjectID.query,
                QUERIES.transactionByObjectID.variables(objectId, userId)
            )

            if (!res) return transactions

            transactions = [...transactions, ...res.transaction]
            if (res.transaction.length !== 50) {
                break
            }
        }

        return transactions
    },
}
const GRAPHQL_URL = 'https://01.alem.school/api/graphql-engine/v1/graphql'
const USER_LOGIN = 'KRaken'
const APP = document.querySelector('#app')
// svgs
const tableData = document.querySelector('#tableData')
const textX = document.querySelector('#textX')
const textY = document.querySelector('#textY')
const svgX = document.querySelector('#axisX')
const svgY = document.querySelector('#axisY')
const svgElements = {
    tableData: () => document.querySelector('#tableData'),
    textX: () => document.querySelector('#textX'),
    textY: () => document.querySelector('#textY'),
    svgX: () => document.querySelector('#axisX'),
    svgY: () => document.querySelector('#axisY'),
}
const maxV = 500
const maxVX = 1000
/******    CONSTANTS END     ******/

/****** HELPERS ******/

// total xp needed for this level
const totalXPForLevel = (level) =>
    Math.round((level * 0.66 + 1) * ((level + 2) * 150 + 50)) // 25 - 75K...

// cumul of all the xp needed to reach this level
const cumulXpForLevel = (level) =>
    level > 0 ? totalXPForLevel(level) + cumulXpForLevel(level - 1) : 0 // 25,recursive call; to 1 lvl; 25,24,23 xp +,

// level reached for this xp
const getLevelFromXp = (xp, level = 0) =>
    cumulXpForLevel(level) >= xp ? level : getLevelFromXp(xp, level + 1)

// total xp from transactions array
const findTotalXp = (transactions) =>
    transactions.reduce((acc, val) => (acc += val[0].amount), 0)

const mappedXpAndProject = (transactions) =>
    transactions.map((el) => ({
        xp: el[0].amount,
        name: el[0].object.name,
        createdAt: new Date(el[0].createdAt),
    }))

const sortNestedByKey = (arr, key) =>
    arr.sort((a, b) => (a[key] > b[key] ? 1 : -1))

const fetchQueries = async () => {
    const userId = await FETCHER.getUserId()

    const progress = await FETCHER.progressByUserId(userId)
    const mappedIds = progress.map((el) => el.object.id)
    const transactionsPromises = mappedIds.map((el) =>
        FETCHER.transactionByObjectID(el, userId)
    )
    const transactions = await Promise.all(transactionsPromises)

    return {userId, transactions}
}

const getProfileInfo = ({userId, transactions}) => {
    const totalXp = findTotalXp(transactions)
    const myLevel = getLevelFromXp(totalXp)
    return {
        userId,
        USER_LOGIN,
        totalXp,
        myLevel,
    }
}

// xp by project diagram
const getXpByProject = (mappedValues) =>
    sortNestedByKey(mappedValues, 'name').map(({xp, name}) => ({
        yValue: xp,
        xValue: name,
    }))

// xp by time diagram
const getXpByTime = (mappedValues) => {
    const xpByTime = sortNestedByKey(mappedValues, 'createdAt')
    for (let i = 1; i < xpByTime.length; i++) {
        xpByTime[i].xp += xpByTime[i - 1].xp
    }
    return xpByTime.map((el) => ({yValue: el.xp, xValue: el.createdAt}))
}

// level by time
const getLevelByTime = (xpByTime) => {
    const copyOfXpTime = Object.assign([], xpByTime)

    const levelByTime = copyOfXpTime.map(({xValue, yValue}) => ({
        yValue: getLevelFromXp(yValue),
        xValue,
    }))

    let arrLen = levelByTime.length
    for (let i = 1; i < arrLen; i++) {
        if (levelByTime[i].yValue === levelByTime[i - 1].yValue) {
            levelByTime.splice(i, 1)
            i--
            arrLen--
        }
    }
    return levelByTime
}

// get all diagrams data
const getDiagramData = ({transactions}) => {
    const mappedValues = mappedXpAndProject(transactions)

    const xpByProject = getXpByProject(mappedValues)
    const xpByTime = getXpByTime(mappedValues)
    const levelByTime = getLevelByTime(xpByTime)

    return {
        xpByProject,
        xpByTime,
        levelByTime,
    }
}
/****** HELPERS ******/

/****** DIAGRAM DRAW ******/

// MOUSEOVER FUNCS

const drawChip = ({text, clientX, clientY, scrollX, scrollY}) => {
    const chip = document.querySelector('.chip')
    chip.style.left = `${clientX + scrollX}px`
    chip.style.top = `${clientY - 30 + scrollY}px`
    chip.innerText = text
    chip.style.opacity = "0.75"
}

const mouseOverChip = (text, e) => {
    e.preventDefault()
    document.querySelector('.chip').style.opacity = "0"
    const {clientX, clientY} = e
    const {scrollX, scrollY} = window
    drawChip({text, clientX, clientY, scrollX, scrollY})
}
// MOUSEOVER FUNCS

const getNode = (node, attrs) => {
    node = document.createElementNS('http://www.w3.org/2000/svg', node)
    for (const param in attrs) {
        node.setAttributeNS(
            null,
            param.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
            attrs[param]
        )
    }

    return node
}

const getFirstDayOfMonth = (date) => {
    const firstDate = new Date(date)
    firstDate.setDate(1)
    firstDate.setHours(6, 0, 1)
    return firstDate
}

const dateDiff = (min, max) =>
    Math.floor((max - min) / 1000 / 3600 / 24 / 30) + 1

const findValueY = ({minY, maxY, value}) => {
    const diff = maxY - minY + 1
    const segmentLen = maxV / (diff - 1)
    return maxV - segmentLen * (value - minY)
}

const findValueX = ({minX, maxX, value}) => {
    const fMin = getFirstDayOfMonth(minX)
    const fMax = getFirstDayOfMonth(maxX)
    const segmentLen = dateDiff(minX, maxX)
    const diff = fMax - fMin
    return ((value - fMin) / diff / segmentLen) * 1000 * (segmentLen - 1)
}

const findBatchSize = (min, max, len) => {
    const segmentSize = (max - min) / len
    const onlyInt = parseInt(segmentSize, 10)
    let i = 10
    while (onlyInt / i > 1) {
        i *= 10
    }
    i /= 10
    return Math.round(segmentSize / i) * i
}

const drawYaxis = (min, max, len) => {
    const batchSize = findBatchSize(min, max, len)
    for (let i = min; i <= max + batchSize - 1; i += batchSize) {
        const posY = findValueY({minY: min, maxY: max, value: i})

        svgElements.svgY().append(
            getNode('circle', {
                cx: '0',
                cy: posY,
                r: '3',
                fill: 'red',
            })
        )

        const textElem = getNode('text', {
            x: '0',
            y: posY,
            class: 'svg-text-y',
        })

        textElem.appendChild(document.createTextNode(`${i}`))
        svgElements.textY().append(textElem)
    }
}

const drawXaxis = (min, max) => {
    const segmentCount = dateDiff(min, max)

    const firstDate = getFirstDayOfMonth(min)

    for (let i = 0; i <= segmentCount; i++) {
        const cx = (1000 / segmentCount) * i
        const currDate = new Date(
            firstDate.setMonth(
                i === 0 ? firstDate.getMonth() : firstDate.getMonth() + 1
            )
        )

        svgElements.svgX().append(
            getNode('circle', {
                cx: cx,
                cy: '500',
                r: '3',
                fill: 'red',
            })
        )

        const textElem = getNode('text', {
            x: '500',
            y: 500 - cx,
            class: 'svg-text-x',
            transform: 'translate(500, 0) rotate(90)',
        })

        textElem.appendChild(
            document.createTextNode(`${currDate.toISOString().substr(0, 10)}`)
        )
        svgElements.textX().append(textElem)
    }
}

const drawData = ({data, minY, maxY, minX, maxX}) => {
    const positions = []

    for (const item of data) {
        const posY = findValueY({minY, maxY, value: item.yValue})
        const posX = findValueX({minX, maxX, value: item.xValue})

        const circle = getNode('circle', {
            cx: posX,
            cy: posY,
            r: '5',
            fill: 'blue',
        })

        circle.addEventListener(
            'mouseenter',
            mouseOverChip.bind(null, item.xValue.toISOString().substr(0, 10))
        )
        svgElements.tableData().append(circle)

        positions.push({
            x: posX,
            y: posY,
        })
    }

    const path = getNode('path', {
        d: `${positions
            .map((el, idx) =>
                idx === 0 ? `M ${el.x} ${el.y}` : `L ${el.x} ${el.y}`
            )
            .join(' ')}`,
        fill: 'none',
        stroke: 'black',
        'stroke-width': 2,
    })
    svgElements.tableData().append(path)
}

const byTimeDrawer = (data) => {
    const [minX, maxX] = [data[0].xValue, data[data.length - 1].xValue]
    const [minY, maxY] = [data[0].yValue, data[data.length - 1].yValue]

    drawYaxis(minY, maxY, data.length)
    drawXaxis(minX, maxX)
    drawData({data, minY, maxY, minX, maxX})
}

const drawXaxisProjects = (data) => {
    const segmentCount = data.length

    for (let i = 0; i < segmentCount; i++) {
        const cx = (1000 / (segmentCount - 1)) * i

        svgElements.svgX().append(
            getNode('circle', {
                cx: cx,
                cy: '500',
                r: '3',
                fill: 'red',
            })
        )

        const textElem = getNode('text', {
            x: '500',
            y: 500 - cx,
            class: 'svg-text-x',
            transform: 'translate(525, 0) rotate(90)',
        })

        textElem.appendChild(document.createTextNode(`${data[i].xValue}`))
        svgElements.textX().append(textElem)
    }
}

const drawDataProjects = (data, min, max) => {
    const diff = max - min

    const cx = 1000 / (data.length - 1)
    console.log(data)
    for (let i = 0; i < data.length; i++) {
        const height =
            ((data[i].yValue - min) / diff / data.length) *
            500 *
            (data.length - 1)
        const rect = getNode('rect', {
            x: maxVX - (cx * (i + 1)),
            y: '500',
            width: cx,
            height: height,
            fill: 'blue',
            stroke: 'black'
        })

        rect.addEventListener(
            'mouseenter',
            mouseOverChip.bind(null, `xp: ${data[i].yValue}\n project: ${data[i].xValue}`)
        )
        svgElements.tableData().append(rect)
    }
}

const findMax = (arr, key) => {
    let max = 0
    for (const item of arr) {
        if (item[key] > max) {
            max = item[key]
        }
    }
    return max
}

const byProjectDrawer = (data) => {
    svgElements.tableData().setAttribute("transform", "translate(1000, 1000) rotate(180)")

    const maxY = findMax(data, 'yValue')

    drawYaxis(0, maxY, data.length)
    drawXaxisProjects(data)
    drawDataProjects(data, 0, maxY)
}

const drawProfile = (data) => {
    const htmlStr = `<div class="info">
            <p>Username:</p>
            <p class="info-msg">${data.USER_LOGIN}</p>
        </div>
        <div class="info">
            <p>Total xp:</p>
            <p class="info-msg">${data.totalXp}</p>
        </div>
        <div class="info">
            <p>Current level:</p>
            <p class="info-msg">${data.myLevel}</p>
        </div>`

    const profileDiv = document.querySelector("#userInfo")
    profileDiv.insertAdjacentHTML("beforeend", htmlStr)

}

/****** DIAGRAM DRAW ******/
const throttle = (func, delay) => {
    let timeout = null
    let cooldown = true
    return (...args) => {
        if (cooldown) {
            cooldown = false
            timeout = setTimeout(() => {
                cooldown = true
            }, delay)
            func(...args)
        }
    }
}

const mouseMoveFunc = (e) => {
    if (e?.target?.nodeName === 'circle' || e?.target?.nodeName === 'rect') return
    document.querySelector('.chip').style.opacity = "0"
}

const rmAttr = () =>
    svgElements.tableData().removeAttribute("transform")

const rmSvgElems = () =>
    Object.keys(svgElements).forEach((el) => (svgElements[el]().innerHTML = ''))

const rmAllSvg = () => {
    rmAttr()
    rmSvgElems()
}

const bindButtons = (diagramsData) => {
    document
        .querySelector("#levelByTime")
        .addEventListener("click", () => {
            rmAllSvg()
            byTimeDrawer(diagramsData.levelByTime)
        })
    document
        .querySelector("#xpByTime")
        .addEventListener("click", () => {
            rmAllSvg()
            byTimeDrawer(diagramsData.xpByTime)
        })
    document
        .querySelector("#xpByProject")
        .addEventListener("click", () => {
            rmAllSvg()
            byProjectDrawer(diagramsData.xpByProject)
        })

}


const main = async () => {
    document.addEventListener('mousemove', throttle(mouseMoveFunc, 100))

    const baseInfo = await fetchQueries()
    const myProfile = getProfileInfo(baseInfo)
    drawProfile(myProfile)

    const diagramsData = getDiagramData(baseInfo)

    bindButtons(diagramsData)
    byTimeDrawer(diagramsData.levelByTime)

    console.log(myProfile)
    console.log(diagramsData)
}

main()
