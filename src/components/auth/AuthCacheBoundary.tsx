// SPDX-License-Identifier: MIT
import {Fragment,useEffect,useRef,useState,type ReactNode} from 'react'
import {QueryClient,QueryClientProvider,useQueryClient} from '@tanstack/react-query'
import {supabase} from '@/lib/supabase'

/** Private query data and component state must not cross account boundaries. */
export function AuthCacheBoundary({children}:{children:ReactNode}) {
    const client=useQueryClient()
    const activeClient=useRef(client)
    const previousUser=useRef<string|null|undefined>(undefined)
    const [scope,setScope]=useState({client,epoch:0})
    useEffect(()=>{
        const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
            const user=session?.user.id??null
            if (event==='SIGNED_OUT' || (previousUser.current!==undefined && previousUser.current!==user)) {
                const previous=activeClient.current
                previous.clear()
                const fresh=new QueryClient({defaultOptions:previous.getDefaultOptions()})
                activeClient.current=fresh
                // A new client also isolates late realtime/mutation callbacks
                // that still hold the previous client's reference.
                setScope(value=>({client:fresh,epoch:value.epoch+1}))
            }
            previousUser.current=user
        })
        return ()=>subscription.unsubscribe()
    },[client])
    return <QueryClientProvider client={scope.client}><Fragment key={scope.epoch}>{children}</Fragment></QueryClientProvider>
}
