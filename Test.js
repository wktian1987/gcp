// test

import {
    AddSetMessage,
    isStrictTrue,
    isStrictString
} from "./utility";

const A = {
    s : 'sss' ,
    UpdateAttr(attName, attV) {this[attName] = attV} ,
    printS(str) {console.log(this.s + str)}
} ;
const a = Object.create(A) ;
