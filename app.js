import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from "../../libs/utils.js";
import { ortho, lookAt, flatten} from "../../libs/MV.js";
import {modelView, loadMatrix, multRotationX, multRotationY, multRotationZ, multScale, pushMatrix, popMatrix, multTranslation } from "../../libs/stack.js";

import * as SPHERE from '../../libs/objects/sphere.js';
import * as CYLINDER from '../../libs/objects/cylinder.js';
import * as CUBE from '../../libs/objects/cube.js';
import * as PYRAMID from '../../libs/objects/pyramid.js';
import * as TORUS from '../../libs/objects/torus.js';

/** @type WebGLRenderingContext */
let gl;

let mode;               // Drawing mode (gl.LINES or gl.TRIANGLES)
let animation = true;   // Animation is running

let projectionState = 1;
let inclination = 0;
let ascension = 1;
let acceleration = 0;
let trajectory = 0;
let bladeVelocity = 0;

const MAX_HEIGHT = 25;
const GROUND_LEVEL = 1;
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

    document.onkeydown = function(event) {
        switch(event.key) {
            case 'w':
                mode = gl.LINES; 
                break;
            case 's':
                mode = gl.TRIANGLES;
                break;
            case 'p':
                animation = !animation;
                break;
            case '+':
                if(animation) speed *= 1.1;
                break;
            case '-':
                if(animation) speed /= 1.1;
                break;
            case "ArrowUp":
                if(ascension < MAX_HEIGHT)
                    ascension += 0.2;
                break;
            case "ArrowDown":
                if(!isTouchingGround())
                    ascension -= 0.2;
                if(ascension < 6 && inclination > MIN_INCLINATION){
                    inclination -= Math.log(ascension) * 1.1;
                    if(acceleration > MIN_ACCELERATION)
                        acceleration -= 0.03;
                }
                liftOff();
                break;
            case "ArrowRight":
                if(acceleration > MIN_ACCELERATION && !isTouchingGround())
                    acceleration -= 0.02;
                if(inclination > MIN_INCLINATION && !isTouchingGround())
                    inclination -= 1;
                break;
            case "ArrowLeft":
                if(ascension >= 6){
                    if(acceleration < MAX_ACCELERATION && !isTouchingGround())
                        acceleration += 0.02;
                    if(inclination < MAX_INCLINATION && !isTouchingGround())
                        inclination += 1;
                }
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

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    SPHERE.init(gl);
    CYLINDER.init(gl);
    CUBE.init(gl);
    PYRAMID.init(gl);
    TORUS.init(gl);
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

    // HELICOPTER ___________________________________________________________

    function RotorBlade()
    {
        multScale([1.5, 0.05, 0.2]);
        
        // Send the current modelview matrix to the vertex shader
        uploadModelView();

        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, [1.0, 1.0, 1.0]);
        SPHERE.draw(gl, program, mode);
    }

    function RotorPivot(){
        multScale([0.1, 0.4, 0.1]);

        // Send the current modelview matrix to the vertex shader
        uploadModelView();

        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, [0.5, 0.5, 0.5]);
        CYLINDER.draw(gl, program, mode);
    }

    function SmallRotor(){
        multRotationX(90);
        multRotationY(-2.5 * bladeVelocity);
        multScale([0.7,0.7,0.7]);
        Rotor();
    }

    function LargeRotor(){
        multRotationY(2.5 * bladeVelocity);
        multScale([1.5,1.5,1.5]);
        Rotor();
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

    function SpiderLegSegment(){
        multScale([0.1, 1.5, 0.1]);
        
        // Send the current modelview matrix to the vertex shader
        uploadModelView();

        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, [0.1, 0.2, 0.8]);
        
        PYRAMID.draw(gl, program, mode);
    }

    function SpiderLeg(){
        pushMatrix();
            multRotationZ(120);
            SpiderLegSegment();
        popMatrix();
        pushMatrix();
            multTranslation([0.9,-0.28,0]);
            multRotationZ(-160);
            SpiderLegSegment();
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
        pushMatrix();
            multTranslation([-0.3,0,-0.9]);
            multRotationY(120);
            SpiderLeg();
        popMatrix();
        pushMatrix();
            multTranslation([0.3,0,-0.9]);
            multRotationY(80);
            SpiderLeg();
        popMatrix();
        pushMatrix();
            multTranslation([0.8,0,-0.7]);
            multRotationY(40);
            SpiderLeg();
        popMatrix();
        pushMatrix();
            multTranslation([-0.8,0,0.7]);
            multRotationY(150 + (180-150)*2);
            SpiderLeg();
        popMatrix();
        pushMatrix();
            multTranslation([-0.3,0,0.9]);
            multRotationY(120 + (180-120)*2);
            SpiderLeg();
        popMatrix();
        pushMatrix();
            multTranslation([0.3,0,0.9]);
            multRotationY(80 + (180 - 80)*2);
            SpiderLeg();
        popMatrix();
        pushMatrix();
            multTranslation([0.8,0,0.7]);
            multRotationY(40 + (180 - 40)*2);
            SpiderLeg();
        popMatrix();
    }

    function TailConnector(){
        multScale([2.4, 0.3, 0.3]);
        
        // Send the current modelview matrix to the vertex shader
        uploadModelView();

        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, [1, 0.2, 0.3]);
        SPHERE.draw(gl, program, mode);
    }

    function TailEnd(){
        multScale([0.35, 0.7, 0.2]);
        uploadModelView();

        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, [1, 0.2, 0.3]);
        SPHERE.draw(gl, program, mode);
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

    function Cabin(){
        multScale([2.6, 1.5, 1.5]);
        
        // Send the current modelview matrix to the vertex shader
        uploadModelView();

        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor, [1, 0.2, 0.3]);
        SPHERE.draw(gl, program, mode);
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
        multRotationY(trajectory);
        multTranslation([0,ascension,-30]);
        //detalhinho extra
        multRotationX(inclination);
        //_______________________
        multRotationZ(inclination);
        MainBody();
    }

    // CITY ___________________________________________________________________

    function Ground()
    {
        multScale([75.0, 0.2,75.0]);

        uploadModelView();
        const uColor = gl.getUniformLocation(program, "uColor");
        gl.uniform3fv(uColor,[0.2,0.9,0.8]);
        CUBE.draw(gl, program, mode);
    }

    function City(){
        pushMatrix();
        Ground();
        popMatrix();
    }



    // OTHERS _________________________________________________________________
    
    function FullScene(){
        City();
        Helicopter();
    }
    
    function render()
    {
        if(animation && !isTouchingGround()){
            trajectory += acceleration;
            bladeVelocity += acceleration + 1.5;
        }

     //   liftOff();

        window.requestAnimationFrame(render);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        gl.useProgram(program);
        
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));

        switch(projectionState){
            case 1:
                loadMatrix(lookAt([-VP_DISTANCE,VP_DISTANCE,VP_DISTANCE], [0,0,0], [0,1,0]));
                break;
            case 2:
                //AP
                loadMatrix(lookAt([-VP_DISTANCE,0,0], [0,0,0], [0,1,0]));
                break;
            case 3:
                //PLANT
                loadMatrix(lookAt([0,VP_DISTANCE,0], [0,0,0], [1,0,0]));
                break;
            case 4:
                //ALD
                loadMatrix(lookAt([0,0,VP_DISTANCE], [0,0,0], [0,1,0]));
                break;
            case 5:
                //BONUS
                loadMatrix(lookAt([0,0,0], [-1,0,0], [0,1,0]));
                break;
        }

       // Helicopter();
       FullScene();
    //  City();
    }

    function isTouchingGround(){
        return ascension <= GROUND_LEVEL;
    }

    function liftOff(){
        if(isTouchingGround()){
            acceleration = 0;
        }
    }
}

const urls = ["shader.vert", "shader.frag"];
loadShadersFromURLS(urls).then(shaders => setup(shaders))
