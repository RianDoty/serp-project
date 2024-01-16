import { ReactNode, useSyncExternalStore } from "react"
import floor from "./assets/floor.svg"
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import { Floor, Model, Room } from "./editor-classes"

const myModel = new Model()
const myFloor = new Floor(myModel, 0)
console.log(myFloor.model)
const myRoom1 = new Room(myFloor)

function Workspace() {
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
            {myModel.render()}
        </Canvas>
    )
}

function TopBar() {
    const onClick = () => {
        new Floor(myModel,0)
        console.log(myModel.tree())
    }

    return (
        <div className="top-bar">
            <button id="floor-button" onClick={onClick}>
                <img src={floor} />
            </button>
        </div>
    )
}

function DocumentTree() {
    const model = useSyncExternalStore(myModel.subscribe, myModel.getSnapshot)
    console.log('DocumentTree Updated!')
    return (
        <p className="document-tree">{model.tree()}</p>
    )
}

function Editor() {


    return (
        <div className="editor">
            <TopBar />
            <div className="canvas-area">
                <DocumentTree />
                <Workspace />
            </div>
        </div>
    )
}

export default Editor