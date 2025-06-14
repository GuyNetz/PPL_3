// L5-typecheck
// ========================================================
import { equals, map, zipWith } from 'ramda';
import { isAppExp, isBoolExp, isDefineExp, isIfExp, isLetrecExp, isLetExp, isNumExp,
         isPrimOp, isProcExp, isProgram, isStrExp, isVarRef, parseL5Exp, unparse,
         AppExp, BoolExp, DefineExp, Exp, IfExp, LetrecExp, LetExp, NumExp,
         Parsed, PrimOp, ProcExp, Program, StrExp, isCExp, parseL5Program, parseL5, isLitExp, LitExp} from "./L5-ast";
import { isCompoundSExp, isEmptySExp, isSymbolSExp, SExpValue } from "./L5-value";
import { applyTEnv, makeEmptyTEnv, makeExtendTEnv, TEnv } from "./TEnv";
import { isProcTExp, makeBoolTExp, makeNumTExp, makeProcTExp, makeStrTExp, makeVoidTExp, 
         parseTE, unparseTExp, makeEmptyTupleTExp, makeLiteralTExp, BoolTExp, NumTExp, StrTExp,
         TExp, VoidTExp, TVar, makeFreshTVar, makePairTExp, matchTVarsInTEs , TExp as L5TExp} from "./TExp";
import { isEmpty, allT, first, rest, NonEmptyList, List, isNonEmptyList } from '../shared/list';
import { Result, makeFailure, bind, makeOk, zipWithResult, isFailure } from '../shared/result';
import { parse as p } from "../shared/parser";
import { format } from '../shared/format';

// Compute the type of a quoated SExp
const typeofQuoted = (sv: SExpValue, isTop: boolean): Result<L5TExp> => {
  // if the SExp is a compound SExp (pair), we need to check its head and tail
  if (isCompoundSExp(sv)) {
    const head = sv.val1;
    const tail = sv.val2;
    return bind(typeofQuoted(head, false), (hte: L5TExp) =>
           bind(typeofQuoted(tail, false), (tte: L5TExp) =>
               makeOk(makePairTExp(hte, tte))));
  }
  // if the SExp is empty, we return an empty tuple type
  if (isEmptySExp(sv)) {
    return makeOk(makeEmptyTupleTExp());
  }
  // if the SExp is a symbol, we return a literal type
  if (isSymbolSExp(sv)) {
    return makeOk(makeLiteralTExp());
  }
  // if the SExp is a number, boolean, or string
  if (typeof sv === "number") {
    return isTop ? makeOk(makeLiteralTExp()) : makeOk(makeNumTExp());
  }
  if (typeof sv === "boolean") {
    return isTop ? makeOk(makeLiteralTExp()) : makeOk(makeBoolTExp());
  }
  if (typeof sv === "string") {
    return isTop ? makeOk(makeLiteralTExp()) : makeOk(makeStrTExp());
  }
  // if we didn't catch any case – error
  return makeFailure(`Unexpected quoted form: ${format(sv)}`);
};

// Purpose: Check that type expressions are equivalent
// as part of a fully-annotated type check process of exp.
// Return an error if the types are different - true otherwise.
// Exp is only passed for documentation purposes.
const checkEqualType = (te1: TExp, te2: TExp, exp: Exp): Result<true> =>
  // If the types are equal, return true
  matchTVarsInTEs(
    [te1], 
    [te2],
    // success: if the types are equal, we return true
    (_mapping) => makeOk(true),
    // fail: if the types are not equal, we return a failure
    () => bind(unparseTExp(te1), (s1: string) =>
               bind(unparseTExp(te2), (s2: string) =>
               bind(unparse(exp), (es: string) =>
                   makeFailure<true>(`Incompatible types: ${s1} and ${s2} in ${es}`))))
  );

// Compute the type of L5 AST exps to TE
// ===============================================
// Compute a Typed-L5 AST exp to a Texp on the basis
// of its structure and the annotations it contains.

// Purpose: Compute the type of a concrete fully-typed expression
export const L5typeof = (concreteExp: string): Result<string> =>
    bind(p(concreteExp), (x) =>
        bind(parseL5Exp(x), (e: Exp) => 
            bind(typeofExp(e, makeEmptyTEnv()), unparseTExp)));

// Purpose: Compute the type of an expression
// Traverse the AST and check the type according to the exp type.
// We assume that all variables and procedures have been explicitly typed in the program.
export const typeofExp = (exp: Parsed, tenv: TEnv): Result<TExp> =>
    isNumExp(exp) ? makeOk(typeofNum(exp)) :
    isBoolExp(exp) ? makeOk(typeofBool(exp)) :
    isStrExp(exp) ? makeOk(typeofStr(exp)) :
    isLitExp(exp)    ? bind(typeofQuoted(exp.val, true), te => makeOk(te)) :
    isPrimOp(exp) ? typeofPrim(exp) :
    isVarRef(exp) ? applyTEnv(tenv, exp.var) :
    isIfExp(exp) ? typeofIf(exp, tenv) :
    isProcExp(exp) ? typeofProc(exp, tenv) :
    isAppExp(exp) ? typeofApp(exp, tenv) :
    isLetExp(exp) ? typeofLet(exp, tenv) :
    isLetrecExp(exp) ? typeofLetrec(exp, tenv) :
    isDefineExp(exp) ? typeofDefine(exp, tenv) :
    isProgram(exp) ? typeofProgram(exp, tenv) :
    // TODO: isSetExp(exp) isLitExp(exp)
    makeFailure(`Unknown type: ${format(exp)}`);

// Purpose: Compute the type of a sequence of expressions
// Check all the exps in a sequence - return type of last.
// Pre-conditions: exps is not empty.
export const typeofExps = (exps: List<Exp>, tenv: TEnv): Result<TExp> =>
    isNonEmptyList<Exp>(exps) ? 
        isEmpty(rest(exps)) ? typeofExp(first(exps), tenv) :
        bind(typeofExp(first(exps), tenv), _ => typeofExps(rest(exps), tenv)) :
    makeFailure(`Unexpected empty list of expressions`);


// a number literal has type num-te
export const typeofNum = (n: NumExp): NumTExp => makeNumTExp();

// a boolean literal has type bool-te
export const typeofBool = (b: BoolExp): BoolTExp => makeBoolTExp();

// a string literal has type str-te
const typeofStr = (s: StrExp): StrTExp => makeStrTExp();

// primitive ops have known proc-te types
const numOpTExp = parseTE('(number * number -> number)');
const numCompTExp = parseTE('(number * number -> boolean)');
const boolOpTExp = parseTE('(boolean * boolean -> boolean)');

// Todo: cons, car, cdr, list
export const typeofPrim = (p: PrimOp): Result<TExp> => {
    if (p.op === '+') return numOpTExp;
    if (p.op === '-') return numOpTExp;
    if (p.op === '*') return numOpTExp;
    if (p.op === '/') return numOpTExp;
    if (p.op === 'and') return boolOpTExp;
    if (p.op === 'or') return boolOpTExp;
    if (p.op === '>') return numCompTExp;
    if (p.op === '<') return numCompTExp;
    if (p.op === '=') return numCompTExp;
    // Important to use a different signature for each op with a TVar to avoid capture
    if (p.op === 'number?') return parseTE('(T -> boolean)');
    if (p.op === 'boolean?') return parseTE('(T -> boolean)');
    if (p.op === 'string?') return parseTE('(T -> boolean)');
    if (p.op === 'list?') return parseTE('(T -> boolean)');
    if (p.op === 'pair?') return parseTE('(T -> boolean)');
    if (p.op === 'symbol?') return parseTE('(T -> boolean)');
    if (p.op === 'not') return parseTE('(boolean -> boolean)');
    if (p.op === 'eq?') return parseTE('(T1 * T2 -> boolean)');
    if (p.op === 'string=?') return parseTE('(T1 * T2 -> boolean)');
    if (p.op === 'display') return parseTE('(T -> void)');
    if (p.op === 'newline') return parseTE('(Empty -> void)');
    // Added cons car cdr for pairs
    if (p.op === 'cons') {
        // creating a pair type with two fresh type variables
        const t1: TVar = makeFreshTVar();
        const t2: TVar = makeFreshTVar();
        // the primitive type is: (t1 * t2 -> (Pair t1 t2))
        return makeOk(makeProcTExp(
            [t1, t2],              // params: t1, t2
            makePairTExp(t1, t2)    // return type: Pair(t1, t2)
        ));
    }

    if (p.op === 'car') {
        // creating two fresh type variables for the pair
        const t1: TVar = makeFreshTVar();
        const t2: TVar = makeFreshTVar();
        // the primitive type is: ( (Pair t1 t2) -> t1 )
        return makeOk(makeProcTExp(
            [ makePairTExp(t1, t2) ],  // single parameter: Pair(t1,t2)
            t1                         // return type: t1
        ));
    }

    if (p.op === 'cdr') {
        // creating two fresh type variables for the pair
        const t1: TVar = makeFreshTVar();
        const t2: TVar = makeFreshTVar();
        // the primitive type is: ( (Pair t1 t2) -> t2 )
        return makeOk(makeProcTExp(
            [ makePairTExp(t1, t2) ],  // single parameter: Pair(t1,t2)
            t2                         // return type: t2
        ));
    }

    // If this is an unrecognized primitive, return an error
    return makeFailure(`Primitive not yet implemented: ${p.op}`);
};

// Purpose: compute the type of an if-exp
// Typing rule:
//   if type<test>(tenv) = boolean
//      type<then>(tenv) = t1
//      type<else>(tenv) = t1
// then type<(if test then else)>(tenv) = t1
export const typeofIf = (ifExp: IfExp, tenv: TEnv): Result<TExp> => {
    const testTE = typeofExp(ifExp.test, tenv);
    const thenTE = typeofExp(ifExp.then, tenv);
    const altTE = typeofExp(ifExp.alt, tenv);
    const constraint1 = bind(testTE, testTE => checkEqualType(testTE, makeBoolTExp(), ifExp));
    const constraint2 = bind(thenTE, (thenTE: TExp) =>
                            bind(altTE, (altTE: TExp) =>
                                checkEqualType(thenTE, altTE, ifExp)));
    return bind(constraint1, (_c1: true) =>
                bind(constraint2, (_c2: true) =>
                    thenTE));
};

// Purpose: compute the type of a proc-exp
// Typing rule:
// If   type<body>(extend-tenv(x1=t1,...,xn=tn; tenv)) = t
// then type<lambda (x1:t1,...,xn:tn) : t exp)>(tenv) = (t1 * ... * tn -> t)
export const typeofProc = (proc: ProcExp, tenv: TEnv): Result<TExp> => {
    const argsTEs = map((vd) => vd.texp, proc.args);
    const extTEnv = makeExtendTEnv(map((vd) => vd.var, proc.args), argsTEs, tenv);
    const constraint1 = bind(typeofExps(proc.body, extTEnv), (body: TExp) => 
                            checkEqualType(body, proc.returnTE, proc));
    return bind(constraint1, _ => makeOk(makeProcTExp(argsTEs, proc.returnTE)));
};

// Purpose: compute the type of an app-exp
// Typing rule:
// If   type<rator>(tenv) = (t1*..*tn -> t)
//      type<rand1>(tenv) = t1
//      ...
//      type<randn>(tenv) = tn
// then type<(rator rand1...randn)>(tenv) = t
// We also check the correct number of arguments is passed.
export const typeofApp = (app: AppExp, tenv: TEnv): Result<TExp> =>
    bind(typeofExp(app.rator, tenv), (ratorTE: TExp) => {
        if (! isProcTExp(ratorTE)) {
            return bind(unparseTExp(ratorTE), (rator: string) =>
                        bind(unparse(app), (exp: string) =>
                            makeFailure<TExp>(`Application of non-procedure: ${rator} in ${exp}`)));
        }
        if (app.rands.length !== ratorTE.paramTEs.length) {
            return bind(unparse(app), (exp: string) => makeFailure<TExp>(`Wrong parameter numbers passed to proc: ${exp}`));
        }
        const constraints = zipWithResult((rand, trand) => bind(typeofExp(rand, tenv), (typeOfRand: TExp) => 
                                                                checkEqualType(typeOfRand, trand, app)),
                                          app.rands, ratorTE.paramTEs);
        return bind(constraints, _ => makeOk(ratorTE.returnTE));
    });

// Purpose: compute the type of a let-exp
// Typing rule:
// If   type<val1>(tenv) = t1
//      ...
//      type<valn>(tenv) = tn
//      type<body>(extend-tenv(var1=t1,..,varn=tn; tenv)) = t
// then type<let ((var1 val1) .. (varn valn)) body>(tenv) = t
export const typeofLet = (exp: LetExp, tenv: TEnv): Result<TExp> => {
    const vars = map((b) => b.var.var, exp.bindings);
    const vals = map((b) => b.val, exp.bindings);
    const varTEs = map((b) => b.var.texp, exp.bindings);
    const constraints = zipWithResult((varTE, val) => bind(typeofExp(val, tenv), (typeOfVal: TExp) => 
                                                            checkEqualType(varTE, typeOfVal, exp)),
                                      varTEs, vals);
    return bind(constraints, _ => typeofExps(exp.body, makeExtendTEnv(vars, varTEs, tenv)));
};

// Purpose: compute the type of a letrec-exp
// We make the same assumption as in L4 that letrec only binds proc values.
// Typing rule:
//   (letrec((p1 (lambda (x11 ... x1n1) body1)) ...) body)
//   tenv-body = extend-tenv(p1=(t11*..*t1n1->t1)....; tenv)
//   tenvi = extend-tenv(xi1=ti1,..,xini=tini; tenv-body)
// If   type<body1>(tenv1) = t1
//      ...
//      type<bodyn>(tenvn) = tn
//      type<body>(tenv-body) = t
// then type<(letrec((p1 (lambda (x11 ... x1n1) body1)) ...) body)>(tenv-body) = t
export const typeofLetrec = (exp: LetrecExp, tenv: TEnv): Result<TExp> => {
    const ps = map((b) => b.var.var, exp.bindings);
    const procs = map((b) => b.val, exp.bindings);
    if (! allT(isProcExp, procs))
        return makeFailure(`letrec - only support binding of procedures - ${format(exp)}`);
    const paramss = map((p) => p.args, procs);
    const bodies = map((p) => p.body, procs);
    const tijs = map((params) => map((p) => p.texp, params), paramss);
    const tis = map((proc) => proc.returnTE, procs);
    const tenvBody = makeExtendTEnv(ps, zipWith((tij, ti) => makeProcTExp(tij, ti), tijs, tis), tenv);
    const tenvIs = zipWith((params, tij) => makeExtendTEnv(map((p) => p.var, params), tij, tenvBody),
                           paramss, tijs);
    const types = zipWithResult((bodyI, tenvI) => typeofExps(bodyI, tenvI), bodies, tenvIs)
    const constraints = bind(types, (types: TExp[]) => 
                            zipWithResult((typeI, ti) => checkEqualType(typeI, ti, exp), types, tis));
    return bind(constraints, _ => typeofExps(exp.body, tenvBody));
};

// Typecheck a full program
// TODO: Thread the TEnv (as in L1)

// Purpose: compute the type of a define
// Typing rule:
//   (define (var : texp) val)
// TODO - write the true definition
export const typeofDefine = (exp: DefineExp, tenv: TEnv): Result<VoidTExp> => {
    // 1. Get the declared type from the variable declaration.
    const declaredType: TExp = exp.var.texp; 
    // 2. Compute the type of the assigned value (exp.val).
    const valueTypeResult: Result<TExp> = typeofExp(exp.val, tenv);

    // 3. Check if the computed type of the value matches the declared type.
    return bind(valueTypeResult, (valueType: TExp) => {
        const typeMatchResult: Result<true> = checkEqualType(valueType, declaredType, exp); 
        return bind(typeMatchResult, (_: true) => {           
            // If we reach here, types match, return VoidTExp 
            return makeOk(makeVoidTExp()); 
        });
    });
};

// Purpose: compute the type of a program
// Typing rule:
// TODO - write the true definition
export const typeofProgram = (exp: Program, tenv: TEnv): Result<TExp> => {
    // A program must have at least one expression according to the grammar (L5 <exp>+) 
    if (isEmpty(exp.exps)) {
        return makeFailure("Program must contain at least one expression.");
    }
    // Use a helper function to sequentially process the expressions and thread the environment.
    return typeofExpsSequential(exp.exps, tenv);
};

const typeofExpsSequential = (exps: Exp[], tenv: TEnv): Result<TExp> => {
    // Base Case: Empty list of expressions should not happen based on typeofProgram check
    if (isEmpty(exps)) {
        return makeFailure("Unexpected empty list of expressions in sequence");
    }

    const firstExp = exps[0];
    const restExps = exps.slice(1);

    // If it's the last expression in the sequence, return its type. 
    if (isEmpty(restExps)) {
        return typeofExp(firstExp, tenv); // Compute type of the last expression 
    }

    // If it's a DefineExp, type-check the definition, extend the environment, and proceed with the rest.
    if (isDefineExp(firstExp)) {
        return bind(typeofDefine(firstExp, tenv), (_: VoidTExp) => {
            // Extend the type environment with the variable name and its declared type. 
            // This new environment will be used for the rest of the expressions.
            const newTEnv = makeExtendTEnv([firstExp.var.var], [firstExp.var.texp], tenv);
            // Recursively process the rest of the expressions with the new environment.
            return typeofExpsSequential(restExps, newTEnv);
        });
    }

    // If it's any other CExp (non-DefineExp) which is not the last expression
    if (isCExp(firstExp)) {
         return bind(typeofExp(firstExp, tenv), (_: TExp) => {
            // Discard the type of the intermediate CExp (_: TExp)
            return typeofExpsSequential(restExps, tenv); // Continue with the *same* environment
         });
    }

    // Should not reach here if grammar is followed.
    return makeFailure(`Unexpected expression type in program sequence: ${format(firstExp)}`);
};

export function L5programTypeof(programString: string): Result<string> {
    // Parse the input string as an L5 program using the appropriate function.
    const parseResult: Result<Program> = parseL5(programString);
    // Check if parsing failed. If so, return the failure as is.
    if (isFailure(parseResult)) {
        return parseResult;
    }
    // If parsing succeeded, get the AST of type Program.
    const programAST: Program = parseResult.value;

    // Define the initial type environment for type-checking the program.
    const initialTEnv: TEnv = makeEmptyTEnv();

    // Perform type-checking on the program's AST using typeofProgram.
    const typecheckResult: Result<TExp> = typeofProgram(programAST, initialTEnv); // typeofProgram is still 'TODO' but expected to return Result<TExp>

    // Check if type-checking failed. If so, return the failure as is.
    if (isFailure(typecheckResult)) {
        return typecheckResult;
    }

    // If type-checking succeeded, get the program's type (of type TExp).
    const programType: TExp = typecheckResult.value;

    // Convert the program's type (TExp) to a readable string.
    // The unparseTExp function already returns Result<string>, so we can return its result directly.
    return unparseTExp(programType);
}