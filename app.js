import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from "../../libs/utils.js";
import { ortho, lookAt, flatten, inverse, mult} from "../../libs/MV.js";
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
//let helicopter = {pos: [0, 0, 0], acceleration: 0, trajectory: 0, inclination: 0, bladeVelocity: 0};
let helicopter = {ascension: 1, acceleration: 0, trajectory: 0, inclination: 0, bladeVelocity: 0};
let heliPos;
let boxes = [];
let thetaSlider = document.getElementById("theta");
let gammaSlider = document.getElementById("gamma");

const MAX_HEIGHT = 27;
const GROUND_LEVEL = 1;
const MAX_INCLINATION = 30;
const MIN_INCLINATION = 0;
const MAX_ACCELERATION = 1;
const MIN_ACCELERATION = 0;

const VP_DISTANCE = 45;

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

    document.onkeydown = function(event) {
        switch(event.key) {
            case 'w':
                mode = gl.LINES; 
                break;
            case 's':
                mode = gl.TRIANGLES;
                break;
            case 'ArrowUp':
                if(helicopter.ascension < MAX_HEIGHT)
                    helicopter.ascension += 0.2;
                break;
            case 'ArrowDown':
                if(!isTouchingGround())
                    helicopter.ascension -= 0.2;
                if(helicopter.ascension < 6 && helicopter.inclination > MIN_INCLINATION){
                    helicopter.inclination -= Math.log(helicopter.ascension) * 1.1;
                    if(helicopter.acceleration > MIN_ACCELERATION)
                        helicopter.acceleration -= 0.02;
                }
                liftOff();
                break;
            case 'ArrowRight':
                if(helicopter.acceleration > MIN_ACCELERATION && !isTouchingGround())
                    helicopter.acceleration -= 0.02;
                if(helicopter.inclination > MIN_INCLINATION && !isTouchingGround())
                    helicopter.inclination -= 1;
                break;
            case 'ArrowLeft':
                if(helicopter.ascension >= 6){
                    if(helicopter.acceleration < MAX_ACCELERATION && !isTouchingGround())
                        helicopter.acceleration += 0.02;
                    if(helicopter.inclination < MAX_INCLINATION && !isTouchingGround())
                        helicopter.inclination += 1;
                }
                break;
            case ' ':
                drop();
                break;
            case '1':
                projectionState = 1;
                break;
            case '2':
                //AP
                projectionState = 2;
                break;
            case '3':
                //PLANT
                projectionState = 3;
                break;
            case '4':
                //ALD
                projectionState = 4;
                break;
            case '5':
                //BONUS
                projectionState = 5;
                break;
        }
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

    function Cube(color){
        uploadModelView();
        
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        CUBE.draw(gl, program, mode);
    }

    function Pyramid(color){
        uploadModelView();
        
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        PYRAMID.draw(gl, program, mode);
    }

    function Cylinder(color){
        uploadModelView();
        
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        CYLINDER.draw(gl, program, mode);
    }

    function Sphere(color){
        uploadModelView();

        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        SPHERE.draw(gl, program, mode);
    }

    function Torus(color){
        uploadModelView();
        
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, color);

        TORUS.draw(gl, program, mode);
    }

    // HELICOPTER ___________________________________________________________

    function RotorBlade(){
        multScale([1.5, 0.05, 0.2]);
        Sphere([1.0, 1.0, 1.0]);
    }

    function RotorPivot(){
        multScale([0.1, 0.4, 0.1]);
        Cylinder([0.5, 0.5, 0.5]);
    }

    function Rotor(){
        pushMatrix();
            RotorPivot();
        popMatrix();
        pushMatrix();
            multTranslation([-0.75, 0, 0]);
            RotorBlade();
        popMatrix();
        pushMatrix();
            multTranslation([0.75, 0, 0]);
            RotorBlade();
        popMatrix();
    }

    function SmallRotor(){
        multRotationX(90);
        multRotationY(-2.5 * helicopter.bladeVelocity);
        multScale([0.7,0.7,0.7]);
        Rotor();
    }

    function LargeRotor(){
        multRotationY(2.5 * helicopter.bladeVelocity);
        multScale([1.5,1.5,1.5]);
        Rotor();
    }

    function SpiderLeg(){
        pushMatrix();
            multRotationZ(120);
            multScale([0.1, 1.5, 0.1]);
            Pyramid([0.1, 0.2, 0.8]);
        popMatrix();
        pushMatrix();
            multTranslation([0.9,-0.28,0]);
            multRotationZ(-160);
            multScale([0.1, 1.5, 0.1]);
            Pyramid([0.1, 0.2, 0.8]);
        popMatrix();
    }

    function Cabin(){
        multScale([2.6, 1.5, 1.5]);
        Sphere([1, 0.2, 0.3]);
    }

    function OppositeLeg(translation, rotation){
        pushMatrix();
        multTranslation([translation[0], translation[1], -translation[2]]);
        multRotationY(rotation + (180 - rotation) * 2);
        SpiderLeg();
        popMatrix();
    }

    function CabinWithLegs(){
        pushMatrix();
            Cabin();
        popMatrix();
        pushMatrix();
            multTranslation([-0.8,0,-0.7]);
            multRotationY(150);
            SpiderLeg();
        popMatrix();
            OppositeLeg([-0.8,0,-0.7], 150);
        pushMatrix();
            multTranslation([-0.3,0,-0.9]);
            multRotationY(120);
            SpiderLeg();
        popMatrix();
            OppositeLeg([-0.3,0,-0.9], 120);
        pushMatrix();
            multTranslation([0.3,0,-0.9]);
            multRotationY(80);
            SpiderLeg();
        popMatrix();
            OppositeLeg([0.3,0,-0.9], 80);
        pushMatrix();
            multTranslation([0.8,0,-0.7]);
            multRotationY(40);
            SpiderLeg();
        popMatrix();
            OppositeLeg([0.8,0,-0.7], 40);
    }

    function TailConnector(){
        multScale([2.4, 0.3, 0.3]);
        Sphere([1, 0.2, 0.3]);
    }

    function TailEnd(){
        multScale([0.35, 0.7, 0.2]);
        Sphere([1, 0.2, 0.3]);
    }

    function Tail(){
        pushMatrix();
            TailConnector();
        popMatrix();
        pushMatrix();
            multTranslation([1.1,0.3,0.0]);
            TailEnd();
            pushMatrix();
                multTranslation([0.0,0.0,0.6]);
                SmallRotor();
            popMatrix();
        popMatrix();
    }

    function MainBody(){
        pushMatrix();
            CabinWithLegs();
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
        pushMatrix();
            multTranslation([1.8,0.2,0]);
            Tail();
        popMatrix();
    }

    function Helicopter(){
        
        multRotationY(helicopter.trajectory);
        
        multTranslation([0,helicopter.ascension,-25]); 

        //detalhinho extra
        multRotationX(helicopter.inclination);
        //_______________________
        multRotationZ(helicopter.inclination);

        MainBody();

        //------------------------------------
        let mModel = mult(inverse(mView), modelView());
        heliPos = mult(mModel, [0,0,0,1]); 
        //------------------------------------
    }

    // CITY ___________________________________________________________________

    function Ground()
    {
        multScale([75.0, 0.2,75.0]);

        uploadModelView();
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor,[0.1,0.5,0.4]);
        CUBE.draw(gl, program, mode);
    }

    function Window(){
        multScale([5.05, 1.2, 1.2]);
        Cube([1,1,0.3]);
    }

    function BuildingBlock(color){
        pushMatrix();
            multScale([5,5,5]);
            Cube(color);
        popMatrix();
        const leftCorner = -1.4;
        for(let i = 0; i < 3; i++)
            for(let j = 0; j < 3; j++){
                pushMatrix();
                multTranslation([0,leftCorner+(j*1.4),leftCorner+(i*1.4)]);
                Window();
                popMatrix();
                pushMatrix();
                multRotationY(90);
                multTranslation([0,leftCorner+(j*1.4),leftCorner+(i*1.4)]);
                Window();
                popMatrix();
            }
    }

    function StandardBuilding(){
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
            multScale([1.5,2,1.5]);
            BuildingBlock([0.65,0.65,0.65]);
            pushMatrix();
                multTranslation([0,3,0]);
                multScale([5,1,5]);
                Pyramid([0.7,0.1,0.1]);
            popMatrix();
        popMatrix();
        pushMatrix();
            multTranslation([7.5,0,0]);
            multScale([1.5,2,1.5]);
            BuildingBlock([0.65,0.65,0.65]);
            pushMatrix();
                multTranslation([0,3,0]);
                multScale([5,1,5]);
                Pyramid([0.7,0.1,0.1]);
            popMatrix();
        popMatrix();
    }

    function Skyscraper(){
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
        popMatrix();
        pushMatrix();
            multRotationY(45);
            multTranslation([0,17,0]);
            multScale([3,5,3]);
            Cube([0.27,0.24,0.5]);
        popMatrix();
        pushMatrix();
            multTranslation([0,20.5,0]);
            multScale([1,2,1]);
            Pyramid([1,0,0]);
        popMatrix();
    }

    function LuxuryBuilding(){
        pushMatrix();
            multScale([3,3,3]);
            BuildingBlock([0.5,0.7,0.7]);
        popMatrix();
        pushMatrix();
            multRotationY(45);
            multScale([3,3,3]);
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
        pushMatrix();
            multTranslation([0,21,0]);
            multScale([3,1.2,3]);
            Torus([1,1,1]);
        popMatrix();
    }

    function Buildings(){
        pushMatrix();
            multTranslation([-32,5,32]);
            StandardBuilding();
        popMatrix();
        pushMatrix();
            multTranslation([25,6.3,-30]);
            multRotationY(55);
            Skyscraper();
        popMatrix();
        pushMatrix();
            multTranslation([0,7.5,0]);
            LuxuryBuilding();
        popMatrix();
    }

    function Tree(){
        pushMatrix();
            multTranslation([0,2.7,0]);
            multScale([3,3.5,3]);
            Pyramid([0,0.4,0]);
        popMatrix();
        pushMatrix();
            multTranslation([0,2.7,0]);
            multRotationY(45);
            multScale([3,3.5,3]);
            Pyramid([0,0.5,0]);
        popMatrix();
        pushMatrix();
            multScale([0.5,2,0.5]);
            Cube([0.3,0.2,0]);
        popMatrix();
    }

    function Trees(){
        pushMatrix();
            multTranslation([-33,1,-33]);
            Tree();
        popMatrix();
        pushMatrix();
            multTranslation([-29,1,-30]);
            Tree();
        popMatrix();
        pushMatrix();
            multTranslation([-32,1,-22]);
            Tree();
        popMatrix();
        pushMatrix();
            multTranslation([30,1,33]);
            Tree();
        popMatrix();
        pushMatrix();
            multTranslation([27,1,25]);
            Tree();
        popMatrix();
        pushMatrix();
            multTranslation([22,1,29]);
            Tree();
        popMatrix();
        pushMatrix();
            multTranslation([33,1,15]);
            Tree();
        popMatrix();
    }

    function River(){
        pushMatrix();
            multRotationY(40);
            multScale([30,0.6,35]);
            Torus([0.3,0.8,0.9]);
        popMatrix();
    }

    function City(){
        pushMatrix();
            Ground();
        popMatrix();
        pushMatrix();
            Buildings();
        popMatrix();
        pushMatrix();
            Trees();
        popMatrix();
        pushMatrix();
            River();
        popMatrix();
    }

    // BOXES _________________________________________________________________
    
    function Box(box)
    {
        multRotationY(box.trajectory);
        multTranslation(box.pos);
        multScale([0.7, 0.7, 0.7]);    
        Cube([1,1,1]);
        console.log(box.pos);
    } 

    function Boxes(){
        for(let i = 0; i < boxes.length; i++){
            const box = boxes[i];
                const age = time - boxes[i].timeOfCreation;
                if(box.pos[1] - 3 * age > GROUND_LEVEL - 0.6)
                    box.pos[1] -= 3 * age;
                else
                    box.pos[1] = GROUND_LEVEL - 0.6;
            pushMatrix();
                Box(box);
            popMatrix();
        }
    }

    // FULL SCENE ______________________________________________________________

    function FullScene()
    { 
         //por a frente apontada para z positivo. a frente estava apontada para x negativo.
        multRotationY(90); 
        pushMatrix();
            City();
        popMatrix();
        pushMatrix();
            Helicopter();
        popMatrix();
        pushMatrix();
            Boxes();
        popMatrix();
        
    }

    //___________________________________________________________________________________
    
    function render(millisecs)
    {
        if(!isTouchingGround()){
            helicopter.trajectory += helicopter.acceleration;
            helicopter.bladeVelocity += helicopter.acceleration + 1.5;
        }

        window.requestAnimationFrame(render);

        time = millisecs / 1000;

        growOld();
        
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        gl.useProgram(program);
        
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));

        enactProjection();

        FullScene();
    }

    // AUXILIARY FUNCTIONS __________________________________________________________

    function isTouchingGround(){
        return helicopter.ascension <= GROUND_LEVEL;
    }

    function liftOff(){
        if(isTouchingGround())
            helicopter.acceleration = 0;
    }

    function growOld(){
        for(let i = 0; i < boxes.length; i++)   
            if(time - boxes[i].timeOfCreation >= 5)
                boxes.shift();
    }

    function drop(){
        const boxPos = [0, helicopter.ascension, -25];
        let box = {pos: boxPos, timeOfCreation: time, trajectory: helicopter.trajectory}; 
     //   let box = {pos: heliPos, timeOfCreation: time};
        boxes.push(box);
        console.log(boxes);
    }

    function enactProjection(){
        switch(projectionState){
            case 1:
                frontView();
                multRotationX(gammaSlider.value);
                multRotationY(thetaSlider.value);                
                showSliders();
                break;
            case 2:
                //AP
                frontView();
                hideSliders();
                break;
            case 3:
                //PLANT
                frontView();
                multRotationX(90);
                hideSliders();
                break;
            case 4:
                //ALD
                frontView();
                multRotationY(-90);
                hideSliders();
                break;
            case 5:
                //BONUS
                loadMatrix(lookAt(heliPos, [0,0,0], [0,1,0]));
                hideSliders();
                break;
        }
    }

    function frontView(){
        mView = lookAt([0,0,VP_DISTANCE],[0,0,0],[0,1,0]);
        loadMatrix(mView);
    }

    function hideSliders(){
        document.getElementById("sliders").style.display = "none";
    }

    function showSliders(){
        document.getElementById("sliders").style.display = "block";
      /*  console.log(thetaSlider.value);
        console.log(gammaSlider.value);*/
    }
}

const urls = ["shader.vert", "shader.frag"];
loadShadersFromURLS(urls).then(shaders => setup(shaders))
