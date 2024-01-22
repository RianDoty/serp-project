import { FormEventHandler, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import floorSvg from "./assets/floor.svg"
import boxSvg from "./assets/box.svg"
import routerSvg from './assets/router.svg'
import { Canvas, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { Floor, Model, Node, ObjectNode, Room } from "./editor-classes"
import roosevelt from './assets/examples/example1.json'
import * as THREE from 'three'

const myModel = Node.fromJSON(roosevelt)

function Workspace() {
    const model = useSyncExternalStore(myModel.subscribe, myModel.getSnapshot)
    const {camera}: {camera: THREE.PerspectiveCamera} = useThree()

    return (
        <>
            <directionalLight
                position={[3.3, 3.0, 4.4]}
                castShadow
                intensity={Math.PI * 2}
            />
            <directionalLight
                position={[-3.3, -3.0, -4.4]}
                castShadow
                intensity={Math.PI / 2}
            />
            <OrbitControls />
            {model.render(camera)}
        </>
    )
}

function JSONConverter({ model }: { model: Model }) {
    const [JSONInput, setJSONInput] = useState('')
    const [JSONInputError, setJSONInputError] = useState('')
    const [JSONOutput, setJSONOutput] = useState('')

    const toJSON = () => {
        const converted = JSON.stringify(model.toJSON())
        console.log(converted)
        setJSONOutput(converted)
    }

    const fromJSON: FormEventHandler<HTMLFormElement> = (e) => {
        e.preventDefault()

        try {
            const myJSON = JSON.parse(JSONInput)
            myModel.replace(Node.fromJSON(myJSON))
            setJSONInputError('')
        } catch (e) {
            setJSONInputError(`Invalid JSON: ${e}`)
        }
    }

    return (
        <div>
            <form onSubmit={fromJSON} autoComplete="off">
                <input type="text" name="JSON Input" value={JSONInput} onChange={(e) => setJSONInput(e.target.value)} />
                <input type="submit" value={'From JSON (loses data!)'} />
                {JSONInputError.length ? <div>{JSONInputError}</div> : null}
            </form>
            <div>
                <button onClick={toJSON}>Convert Workspace to JSON</button>
                <textarea value={JSONOutput} readOnly />
            </div>
        </div>
    )
}

function TopBar({ model }: { model: Model }) {
    const [routerCount, setRouterCount] = useState('1')
    const [avgSpeed, setAvgSpeed] = useState('N/A')

    const roomCount = model.getDescendants(true).filter(d => d.name === 'Room').length

    const onFloorClick = () => {
        new Floor({ height: 1 }).addTo(model.source)
        console.log(model.source.tree())
    }

    const onRoomClick = () => {
        let parent: Node
        if (model.source.selectionManager.selected?.name === 'Floor') {
            parent = model.source.selectionManager.selected.source
        } else {
            parent = model.source.findFirstDescendant('Floor') as Floor
        }
        new Room().addTo(parent)
    }

    const onRouterClick = () => {
        const count = Number(routerCount)

        if (isNaN(count)) return setRouterCount('Invalid')

        setAvgSpeed(String(model.source.optimizationManager.optimize(count)).slice(0,5)+'Mbps / 42Mbps MAX')
    }

    return (
        <div className="top-bar">
            <button id="floor-button" onClick={onFloorClick}>
                <img src={floorSvg} />
            </button>
            <button id="room-button" onClick={onRoomClick}>
                <img src={boxSvg} />
            </button>
            <button id="router-button" onClick={onRouterClick}>
                <img src={routerSvg} />
            </button>
            <div>
                Router Count <br/>
                <input value={routerCount} onChange={e => setRouterCount(e.target.value)}/> <br/>
                Room Count for Comparison: <br/>
                <input readOnly value={roomCount}/>
            </div>
            <div>
                Average Speed:
                <input readOnly value={avgSpeed}/>
            </div>
        </div>
    )
}

function DocumentTree({ model }: { model: Model }) {
    const selectionManager = model.source.selectionManager

    function NodeButton({ node }: { node: Node }) {
        const selected = selectionManager.isSelected(node)
        return (
            <button className={selected ? 'selected' : ''} onClick={() => selectionManager.select(node)}>{node.constructor.name}</button>
        )
    }

    function generateButtons(node: Node) {
        const children = Array.from(node.children)
        return (
            <li>
                <NodeButton node={node} />
                {children.length ? <ul>{children.map(generateButtons)}</ul> : null}
            </li>
        )
    }

    return (
        <ul className="document-tree">
            {generateButtons(model)}
        </ul>
    )
}

function Inspector() {
    const model = useSyncExternalStore(myModel.subscribe, myModel.getSnapshot)
    const obj = model.source.selectionManager.selected?.source as Node | ObjectNode | null
    const isObj = obj?.isObject
    const [px, spx] = useState(isObj? String(obj.position.x) : '0')
    const [py, spy] = useState(isObj? String(obj.position.y) : '0')
    const [pz, spz] = useState(isObj? String(obj.position.z) : '0')
    const [sx, ssx] = useState(isObj? String(obj.size.x) : '0')
    const [sy, ssy] = useState(isObj? String(obj.size.y) : '0')
    const [sz, ssz] = useState(isObj? String(obj.size.z) : '0')

    useEffect(() => {
        if (isObj) {
            spx(String(obj.position.x))
            spy(String(obj.position.y))
            spz(String(obj.position.z))
            ssx(String(obj.size.x))
            ssy(String(obj.size.y))
            ssz(String(obj.size.z))
        }
    }, [obj])

    useEffect(() => {
        const d = [px,py,pz,sx,sy,sz].map(v => Number(v))
        console.log(d)
        if (isObj && d.every(v => !Number.isNaN(v))) {
            obj.source.setPosition(new THREE.Vector3(d[0],d[1],d[2]))
            obj.source.setSize(new THREE.Vector3(d[3],d[4],d[5]))
        }
        
    }, [px,py,pz,sx,sy,sz])
    
    if (!obj) return (
        <div className="inspector">
            <div className="object-name">
                No Object Selected
            </div>
        </div>
    )

    if (!isObj) return (
        <div className="inspector">
            <div className="object-name">
                {obj.name}
            </div>
        </div>
    )

    return (
        <div className="inspector">
            <div className="object-name">
                {obj.name}
            </div>
            <div>
                Position <br/>
                <input value={px} onChange={e => spx(e.target.value)}/>
                <input value={py} onChange={e => spy(e.target.value)}/>
                <input value={pz} onChange={e => spz(e.target.value)}/>
            </div>
            <div>
                Size <br/>
                <input value={sx} onChange={e => ssx(e.target.value)}/>
                <input value={sy} onChange={e => ssy(e.target.value)}/>
                <input value={sz} onChange={e => ssz(e.target.value)}/>
            </div>
        </div>
    )
}

function Editor() {
    const model = useSyncExternalStore(myModel.subscribe, myModel.getSnapshot)

    return (
        <div className="editor">
            <TopBar model={model} />
            <div className="canvas-area">
                <DocumentTree model={model} />
                <Canvas>
                    <Workspace />
                </Canvas>
                <Inspector/>
                <JSONConverter model={model} />
            </div>
        </div>
    )
}

export default Editor