// from https://supabase.com/docs/guides/auth/auth-helpers/nextjs

import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";

// TODO why isn't this middleware doing anything to help me refresh the session? 

// verify auth & redirect if appropriate
export async function middleware(req) {
    // verify auth
    const res = NextResponse.next() //?
    const supabase = createMiddlewareClient({req, res})
    const {data:{user} } = await supabase.auth.getSession() 

    // v redirect if auth level not appropriate for page (do this later, i think this is just a 'making sure' measure)
    console.log('middleware says this is user: ', user)
    if (user && req.nextUrl.pathname === '/') {
        console.log('found user and redirecting to app')
        // return NextResponse.redirect(new URL('/spotifyLogin', req.url))
        return NextResponse.redirect('http://localhost:3000/home')
        
    }   


    if (!user && req.nextUrl.pathname == '/home') {
        console.log('found that supabase user not logged in, returning to safe zone...')
        // return NextResponse.redirect(new URL('/', req.url))
        return NextResponse.redirect('http://localhost:3000/')
    }

    return res
}