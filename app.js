import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from "../../libs/utils.js";
import { ortho, lookAt, flatten, inverse, mult, rotateX, rotateY, rotateZ} from "../../libs/MV.js";
import {modelView, loadMatrix, multRotationX, multRotationY, multRotationZ, multScale, pushMatrix, popMatrix, multTranslation } from "../../libs/stack.js";

import * as SPHERE from '../../libs/objects/sphere.js';
import * as CYLINDER from '../../libs/objects/cylinder.js';
import * as CUBE from '../../libs/objects/cube.js';
import * as PYRAMID from '../../libs/objects/pyramid.js';
import * as TORUS from '../../libs/objects/torus.js';

/** @type WebGLRenderingContext */
let gl;

let mode;               // Drawing mode (gl.LINES or gl.TRIANGLES)

let time = 0;
let projectionState = 1;
let mView;
let heli = {ascension: 1, acceleration: 0, trajectory: 0, inclination: 0, bladeVelocity: 0};
let heliPos;
let boxes = [];
let isSpeedingUp = false;
let thetaSlider = document.getElementById("theta");
let gammaSlider = document.getElementById("gamma");

const MAX_HEIGHT = 28;
const SAFE_HEIGHT = 5;
const MAX_INCLINATION = 30;
const MIN_INCLINATION = 0;
const MAX_ACCELERATION = 1;
const MIN_ACCELERATION = 0;
const VP_DISTANCE = 40;

function setup(shaders)
{
    let canvas = document.getElementById("gl-canvas");
    let aspect = canvas.width / canvas.height;

    gl = setupWebGL(canvas);

    let program = buildProgramFromSources(gl, shaders["shader.vert"], shaders["shader.frag"]);

    let mProjection = ortho(-VP_DISTANCE*aspect,VP_DISTANCE*aspect, -VP_DISTANCE, VP_DISTANCE,-3*VP_DISTANCE,3*VP_DISTANCE);

    mode = gl.TRIANGLES; 

    resize_canvas();
    window.addEventListener("resize", resize_canvas);

    document.onkeydown = function(event) 
    {
        switch(event.key) {
            case 'w':
                mode = gl.LINES; 
                break;
            case 's':
                mode = gl.TRIANGLES;
                break;
            case 'ArrowUp':
                if(heli.ascension < MAX_HEIGHT)
                    heli.ascension += 0.2;
                break;
            case 'ArrowDown':
                descend();
                liftOff();
                break;
            case 'ArrowLeft':
                increaseSpeed();
                break;
            case ' ':
                drop();
                break;
            case '1':
                projectionState = 1;
                break;
            case '2':
                projectionState = 2;
                break;
            case '3':
                projectionState = 3;
                break;
            case '4':
                projectionState = 4;
                break;
            case '5':
                projectionState = 5;
                break;
        }
    }

    document.onkeyup = function(event) 
    {
        if(event.key == 'ArrowLeft')
            isSpeedingUp = false;
    }

    gl.clearColor(0.3, 1, 1, 1.0);
    SPHERE.init(gl);
    CYLINDER.init(gl);
    CUBE.init(gl);
    PYRAMID.init(gl);
    TORUS.init(gl,100,100,0.5,0.2);
    gl.enable(gl.DEPTH_TEST);   // Enables Z-buffer depth test
    
    window.requestAnimationFrame(render);

    function resize_canvas(event)
    {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        aspect = canvas.width / canvas.height;

        gl.viewport(0,0,canvas.width, canvas.height);
        mProjection = ortho(-VP_DISTANCE*aspect,VP_DISTANCE*aspect, -VP_DISTANCE, VP_DISTANCE,-3*VP_DISTANCE,3*VP_DISTANCE);
    }

    function uploadModelView()
    {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mModelView"), false, flatten(modelView()));
    }

    // BASIC OBJECTS ________________________________________________________

    function Cube(color)
    {
        uploadModelView();
        
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        CUBE.draw(gl, program, mode);
    }

    function Pyramid(color)
    {
        uploadModelView();
        
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        PYRAMID.draw(gl, program, mode);
    }

    function Cylinder(color)
    {
        uploadModelView();
        
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        CYLINDER.draw(gl, program, mode);
    }

    function Sphere(color)
    {
        uploadModelView();

        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        SPHERE.draw(gl, program, mode);
    }

    function Torus(color)
    {
        uploadModelView();
        
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        TORUS.draw(gl, program, mode);
    }

    // heli ___________________________________________________________

    function RotorBlade()
    {
        multScale([1.5, 0.1, 0.2]);
        Sphere([1.0, 1.0, 1.0]);
    }

    function RotorPivot()
    {
        multScale([0.1, 0.4, 0.1]);
        Cylinder([0.5, 0.5, 0.5]);
    }

    function Rotor()
    {
        pushMatrix();
            RotorPivot();
        popMatrix();
        pushMatrix();
            multTranslation([-0.75, 0, 0]);
            RotorBlade();
        popMatrix();
            multTranslation([0.75, 0, 0]);
            RotorBlade();
    }

    function SmallRotor()
    {
        multRotationX(90);
        multRotationY(-heli.bladeVelocity);
        multScale([0.7,0.7,0.7]);
        Rotor();
    }

    function LargeRotor()
    {
        multRotationY(heli.bladeVelocity);
        multScale([1.5,1.5,1.5]);
        Rotor();
    }

    function SpiderLeg(translation, rotation)
    {
        pushMatrix();
            multTranslation(translation);
            multRotationY(rotation);
            pushMatrix();
                multRotationZ(120);
                multScale([0.1, 1.5, 0.1]);
                Pyramid([0.1, 0.2, 0.8]);
            popMatrix();
                multTranslation([0.9,-0.28,0]);
                multRotationZ(-160);
                multScale([0.1, 1.5, 0.1]);
                Pyramid([0.1, 0.2, 0.8]);
        popMatrix();
    }

    function Legs()
    {
        SpiderLeg([-0.8,0,-0.7], 150);
        SpiderLeg([-0.8,0,0.7], -150);
        SpiderLeg([-0.3,0,-0.9], 120);
        SpiderLeg([-0.3,0,0.9], -120);
        SpiderLeg([0.3,0,-0.9], 80);
        SpiderLeg([0.3,0,0.9], -80);
        SpiderLeg([0.8,0,-0.7], 40);
        SpiderLeg([0.8,0,0.7], -40);
    }

    function TailConnector()
    {
        multScale([2.4, 0.3, 0.3]);
        Sphere([1, 0.2, 0.3]);
    }

    function TailEnd()
    {
        multTranslation([1.1,0.3,0]);
        multScale([0.35, 0.7, 0.2]);
        pushMatrix();
            Sphere([1, 0.2, 0.3]);
        popMatrix();
            multTranslation([0,0,0.6]);
            SmallRotor();
    }

    function Tail()
    {
        pushMatrix();
            TailConnector();
        popMatrix();
            TailEnd();
    }

    function Cabin()
    {
        multScale([2.6, 1.5, 1.5]);
        Sphere([1, 0.2, 0.3]);
    }

    function MainBody()
    {
        pushMatrix();
            Cabin();
        popMatrix();
        pushMatrix();
            Legs();
        popMatrix();
        pushMatrix();
            multTranslation([0,1,0]);
            LargeRotor();
        popMatrix();
        pushMatrix();
            multTranslation([0,1.3,0]);
            multRotationY(90);
            LargeRotor();
        popMatrix();
            multTranslation([1.8,0.2,0]);
            Tail();
    }

    function Helicopter()
    {
        multRotationY(heli.trajectory);
        multTranslation([0,heli.ascension,-30]); 
        //detalhinho extra
        multRotationX(heli.inclination);
        multRotationZ(heli.inclination);
        

        //------------------------------------
        const mModel = mult(inverse(mView), modelView());
        heliPos = mult(mModel, [0,0,0,1]); 
        //------------------------------------
        MainBody();
    }

        // BOXES _________________________________________________________________
    
        function Box(box)
        {
         //   multRotationY(-90);
            multTranslation(box.pos);  
            multScale([0.8, 0.8, 0.8]);    
            Cube([1,1,1]);
            console.log(box.pos);
        } 
    
        function Boxes()
        {
            for(let i = 0; i < boxes.length; i++){
                const box = boxes[i];
                    const age = time - boxes[i].timeOfCreation;
                    if(box.pos[1] - 3 * age > 0.5)
                        box.pos[1] -= 3 * age;
                    else
                        box.pos[1] = 0.5;
                pushMatrix();
                    Box(box);
                popMatrix();
            }
        }
    
        function drop()
        {
            let box = {pos: heliPos.slice(0,3), timeOfCreation: time};
            
            boxes.push(box);
            console.log(boxes);
        }
        
    // CITY ___________________________________________________________________

    function Ground()
    {
        multScale([75.0, 0.2,75.0]);
        Cube([0.1,0.5,0.4]);
    }

    function Window()
    {
        multScale([5.05, 1.2, 1.2]);
        Cube([1,1,0.3]);
    }

    function BuildingBlock(color)
    {
        pushMatrix();
            multScale([5,5,5]);
            Cube(color);
        popMatrix();
        const bottomLeft = - 1.4;
        for(let i = 0; i < 3; i++)
            for(let j = 0; j < 3; j++){
                let vertical = bottomLeft + j * 1.4;
                let horizontal = bottomLeft+ i * 1.4;
                pushMatrix();
                    multTranslation([0,vertical,horizontal]);
                    Window();
                popMatrix();
                pushMatrix();
                    multRotationY(90);
                    multTranslation([0,vertical,horizontal]);
                    Window();
                popMatrix();
            }
    }

    function SmallBuilding()
    {
        multScale([1.5,2,1.5]);
        BuildingBlock([0.65,0.65,0.65]);
        multTranslation([0,3,0]);
        multScale([5,1,5]);
        Pyramid([0.7,0.1,0.1]);    
    }

    function TripletBuilding()
    {
        pushMatrix();
            multScale([1.5,2,1.5]);
            BuildingBlock([0.8,0.8,0.8]);
        popMatrix();
        pushMatrix();
            multTranslation([0,8.4,0])
            multScale([1.5,2,1.5]);
            BuildingBlock([0.8,0.8,0.8]);
        popMatrix();
        pushMatrix();
            multTranslation([0,0,-7.5]);
            SmallBuilding();
        popMatrix();
            multTranslation([7.5,0,0]);
            SmallBuilding();
    }

    function Skyscraper()
    {
        pushMatrix();
            multScale([1.5,2.5,1.5]);
            BuildingBlock([0.5,0.5,0.5]);
        popMatrix();
        pushMatrix();
            multTranslation([0,10,0]);
            multScale([1,2,1]);
            BuildingBlock([0.6,0.6,0.6]);
        popMatrix();
        pushMatrix();
            multTranslation([0,17,0]);
            multScale([3,5,3]);
            Cube([0.27,0.24,0.5]);
            multRotationY(45);
            Cube([0.27,0.24,0.5]);
        popMatrix();
            multTranslation([0,20.5,0]);
            multScale([1,2,1]);
            Pyramid([1,0,0]);
    }

    function LuxuryBuilding()
    {
        pushMatrix();
            multScale([3,3,3]);
            BuildingBlock([0.5,0.7,0.7]);
            multRotationY(45);
            BuildingBlock([0.5,0.7,0.7]);
        popMatrix();
        pushMatrix();
            multTranslation([0,6,0]);
            multScale([15,7.5,15]);
            Sphere([0.8,0.8,0.8]);
        popMatrix();
        pushMatrix();
            multTranslation([0,16,0]);
            multScale([0.5,15,0.5]);
            Cylinder([0.2,0.2,0.3]);
        popMatrix();
        pushMatrix();
            multTranslation([0,15,0]);
            multScale([7,3.5,7]);
            Torus([0.3,0.3,0.3]);
        popMatrix();
        pushMatrix();
            multTranslation([0,18,0]);
            multScale([5,2,5]);
            Torus([0.6,0.6,0.6]);
        popMatrix();
            multTranslation([0,21,0]);
            multScale([3,1.2,3]);
            Torus([1,1,1]);
    }

    function Buildings()
    {
        pushMatrix();
            multTranslation([-32,5,32]);
            TripletBuilding();
        popMatrix();
        pushMatrix();
            multTranslation([25,6.3,-30]);
            multRotationY(55);
            Skyscraper();
        popMatrix();
        multTranslation([0,7.5,0]);
        LuxuryBuilding();
    }

    function Tree(translation)
    {
        pushMatrix();
            multTranslation(translation);
            pushMatrix();
                multTranslation([0,2.7,0]);
                multScale([3,3.5,3]);
                Pyramid([0,0.4,0]);
                multRotationY(45);
                Pyramid([0,0.5,0]);
            popMatrix();
            multScale([0.5,2,0.5]);
            Cube([0.3,0.2,0]);
        popMatrix();
    }

    function Trees()
    {
        Tree([-33,1,-33]);
        Tree([-29,1,-30]);
        Tree([-32,1,-22]);
        Tree([30,1,33]);
        Tree([27,1,25]);
        Tree([22,1,29]);
        Tree([33,1,15]);
    }

    function River()
    {
        multRotationY(40);
        multScale([30,0.6,35]);
        Torus([0.3,0.8,0.9]);
    }

    function City()
    {
        pushMatrix();
            Ground();
        popMatrix();
        pushMatrix();
            Buildings();
        popMatrix();
        Trees();
        River();
    }

    // FULL SCENE ______________________________________________________________

    function FullScene()
    { 
        pushMatrix();
            City();
        popMatrix();
        pushMatrix();
            Helicopter();
        popMatrix();
            Boxes(); 
    }

    //___________________________________________________________________________________
    
    function render(millisecs)
    {
        if(!isTouchingGround()){
            heli.trajectory += heli.acceleration;
            heli.bladeVelocity += (heli.acceleration + 1.5) * 2.5;
        }

        window.requestAnimationFrame(render);

        time = millisecs / 1000;

        decreaseSpeed();

        growOld();
        
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        gl.useProgram(program);
        
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));

        enactProjection();

        FullScene();
    }

    // AUXILIARY FUNCTIONS __________________________________________________________
    
    function increaseSpeed()
    {
        isSpeedingUp = true;
        if(heli.ascension >= SAFE_HEIGHT && !isTouchingGround()){
            if(heli.acceleration < MAX_ACCELERATION)
                heli.acceleration += 0.02;
            if(heli.inclination < MAX_INCLINATION)
                heli.inclination += 1;
        }
    }

    function decreaseSpeed()
    {
        if(!isSpeedingUp && !isTouchingGround()){
            if(heli.acceleration > MIN_ACCELERATION)
                heli.acceleration -= 0.002;
            if(heli.inclination > MIN_INCLINATION)
                heli.inclination -= 0.1;
        }
    }

    function descend()
    {
        if(!isTouchingGround())
            heli.ascension -= 0.2;
        if(heli.ascension < SAFE_HEIGHT && heli.inclination > MIN_INCLINATION){
            heli.inclination -= Math.log(heli.ascension);
        }
    }

    function isTouchingGround()
    {
        return heli.ascension <= 1;
    }

    function liftOff()
    {
        if(isTouchingGround())
            heli.acceleration = 0;
    }

    function growOld()
    {
        for(let i = 0; i < boxes.length; i++)   
            if(time - boxes[i].timeOfCreation >= 5)
                boxes.shift();
    }



    function enactProjection()
    {
        switch(projectionState){
            case 1:
                mView = mult(frontView(), mult(rotateX(gammaSlider.value), rotateY(thetaSlider.value)));           
                showSliders();
                break;
            case 2:
                mView = frontView();
                hideSliders();
                break;
            case 3:
                mView = mult(frontView(), rotateX(90));
                hideSliders();
                break;
            case 4:
                mView = mult(frontView(), rotateY(-90));
                hideSliders();
                break;
            case 5:
            //    loadMatrix(lookAt(heliPos, [0,0,0], [0,1,0]));
                hideSliders();
                break;
        }
        loadMatrix(mView);
    }

    function frontView()
    {
        return lookAt([0,0,VP_DISTANCE],[0,0,0],[0,1,0]);
    }

    function hideSliders()
    {
        document.getElementById("sliders").style.display = "none";
    }

    function showSliders()
    {
        document.getElementById("sliders").style.display = "block";
      /*  console.log(thetaSlider.value);
        console.log(gammaSlider.value); */
    }
}
const urls = ["shader.vert", "shader.frag"];
loadShadersFromURLS(urls).then(shaders => setup(shaders))