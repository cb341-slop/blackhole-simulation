import katex from './vendor/katex-0.19.0/katex.mjs';

// Typeset equations with accessible MathML alongside the visual rendering.
for(const element of document.querySelectorAll('[data-tex]')){
 const tex=element.dataset.tex;
 try{
  katex.render(tex,element,{displayMode:true,throwOnError:true,trust:false,output:'htmlAndMathml'});
 }catch(error){
  console.error('Could not typeset equation:',error);
  element.textContent=tex;
 }
}
