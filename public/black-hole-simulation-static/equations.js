import katex from './vendor/katex-0.19.0/katex.mjs';

// The source remains available both in the page and in the MathML annotation.
for(const element of document.querySelectorAll('[data-tex]')){
 const tex=element.dataset.tex;
 try{
  katex.render(tex,element,{displayMode:true,throwOnError:true,trust:false,output:'htmlAndMathml'});
 }catch(error){
  console.error('Could not typeset equation:',error);
  element.textContent=tex;
 }
 const source=document.createElement('details');source.className='tex-source';
 const label=document.createElement('summary');label.textContent='TeX source';
 const code=document.createElement('pre');code.textContent=tex;
 source.append(label,code);element.after(source);
}
