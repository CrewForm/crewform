// SPDX-License-Identifier: MIT
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {QueryClient,QueryClientProvider,useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
const events=vi.hoisted(()=>({listener:undefined as undefined|((event:string,session:{user:{id:string}}|null)=>void)}))
vi.mock('@/lib/supabase',()=>({supabase:{auth:{onAuthStateChange:(listener:typeof events.listener)=>{
    events.listener=listener;return {data:{subscription:{unsubscribe:vi.fn()}}}
}}}}))
import {AuthCacheBoundary} from './AuthCacheBoundary'
afterEach(()=>{cleanup();events.listener=undefined})
let activeClient:QueryClient
function PrivateDraft(){activeClient=useQueryClient();const [text,setText]=useState('');return <input aria-label="Private draft" value={text} onChange={event=>setText(event.target.value)} />}
function event(name:string,user:string|null) {
    const listener=events.listener;if(!listener) throw new Error('Auth listener not attached')
    act(()=>listener(name,user?{user:{id:user}}:null))
}
it('clears private query/mutation data and local drafts on account changes, while retaining same-account refreshes',()=>{
    const client=new QueryClient()
    render(<QueryClientProvider client={client}><AuthCacheBoundary><PrivateDraft /></AuthCacheBoundary></QueryClientProvider>)
    event('INITIAL_SESSION','first')
    client.setQueryData(['private-run'],'private result')
    client.getMutationCache().build(client,{mutationKey:['private-write']})
    fireEvent.change(screen.getByRole('textbox'),{target:{value:'private draft'}})
    event('TOKEN_REFRESHED','first')
    expect(client.getQueryData(['private-run'])).toBe('private result')
    event('SIGNED_IN','second')
    expect(client.getQueryData(['private-run'])).toBeUndefined()
    expect(client.getMutationCache().getAll()).toHaveLength(0)
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(activeClient).not.toBe(client)
    activeClient.setQueryData(['private-run'],'second account data');event('SIGNED_OUT',null)
    expect(activeClient.getQueryData(['private-run'])).toBeUndefined()
})
it('does not retain an old request that completes after sign-out',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    render(<QueryClientProvider client={client}><AuthCacheBoundary><PrivateDraft /></AuthCacheBoundary></QueryClientProvider>)
    event('INITIAL_SESSION','first')
    let resolveOld!:(value:string)=>void
    const request=client.fetchQuery({queryKey:['private-run'],queryFn:()=>new Promise<string>(resolve=>{resolveOld=resolve})}).catch(()=>undefined)
    event('SIGNED_OUT',null)
    resolveOld('old private result');await request
    client.setQueryData(['private-run'],'late realtime callback from the old account')
    expect(activeClient.getQueryData(['private-run'])).toBeUndefined()
})
