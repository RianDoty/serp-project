import { FormEventHandler, useState, useSyncExternalStore } from "react"
import floorSvg from "./assets/floor.svg"
import boxSvg from "./assets/box.svg"
import routerSvg from './assets/router.svg'
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { Floor, Model, Node, Room } from "./editor-classes"

const myModel = new Model()
const myFloor = new Floor()
const myRoom1 = new Room()
myModel.add(myFloor)
myFloor.add(myRoom1)

function Workspace({ model }: { model: Model }) {

    return (
        <Canvas>
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
            {model.render()}
        </Canvas>
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
    const onFloorClick = () => {
        new Floor({ height: 1 }).addTo(model.source)
        console.log(model.source.tree())
    }

    const onRoomClick = () => {
        let parent: Node
        if (model.source.selectionManager.selected?.name === 'Floor') {
            parent = model.source.selectionManager.selected.source
        } else {
            parent = model.source.findFirst('Floor') as Floor
        }
        new Room({ position: [2, 0, 2] }).addTo(parent)
    }

    const onRouterClick = () => {
        model.source.optimizationManager.optimize()
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

function Editor() {
    const model = useSyncExternalStore(myModel.subscribe, myModel.getSnapshot)

    return (
        <div className="editor">
            <TopBar model={model} />
            <div className="canvas-area">
                <DocumentTree model={model} />
                <Workspace model={model} />
                <JSONConverter model={model} />
            </div>
        </div>
    )
}

export default Editor