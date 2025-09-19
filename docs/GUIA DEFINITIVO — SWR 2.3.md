# **GUIA DEFINITIVO — SWR 2.3.6 (2025) para Socialwise/Chatwit**

> Padrões oficiais e “opinionados” para construir telas **rápidas, previsíveis e modernas** em React/Next.js (App Router) com **SWR 2.3.6**.
> Tudo aqui é compatível com a doc oficial — quando for detalhe não óbvio, cito a fonte.

---

## 0) TL;DR — Decisões do projeto

* **Fetcher único** (JSON, erro se `!res.ok`) + validação opcional (Zod) **dentro do hook**.
* **SWRConfig global** com:

  * `fetcher` padrão; `revalidateOnFocus: true` (telas interativas), `false` em dashboards pesados.
  * `revalidateIfStale: true`, `revalidateOnReconnect: true`, `dedupingInterval: 1000–2000ms`. ([swr.vercel.app][1])
  * `errorRetryInterval` e `shouldRetryOnError` por contexto.
  * `provider: () => new Map()` (swap para LRU/persistência quando precisar).
* **Estados**: use `isLoading` para **primeiro** carregamento; `isValidating` para revalidações. ([swr.vercel.app][2])
* **Listas & filtros**: `keepPreviousData: true` para não “piscar” conteúdo. ([swr.vercel.app][3])
* **Mutations**: **preferir `useSWRMutation`** para chamadas remotas; **usar `mutate`** para atualizar/invalidar cache e orquestrar UI otimista. (*`mutate(key, asyncFn)` é suportado, mas não é nosso padrão*). ([swr.vercel.app][4])
* **Pré-busca**: `preload` para hover/roteamento/interseção. ([swr.vercel.app][5])
* **Tempo real**: `useSWRSubscription` (WS/SSE) — **sem** polling. ([swr.vercel.app][6])
* **Next.js App Router** (híbrido): buscar no **Server**, passar **Promise** em `SWRConfig.fallback`, consumir no Client com SWR + **Suspense**. ([swr.vercel.app][3])
* **Observabilidade**: **middleware** (métricas/retry/tracing). ([swr.vercel.app][7])
* **Multi-aba**: BroadcastChannel + `mutate` (logout/dados críticos).

---

## 1) Fundamentos e Config

### 1.1 SWR em uma frase

**S**tale-**W**hile-**R**evalidate: retorna cache **agora**, revalida em segundo plano e atualiza quando o dado novo chega — UX rápida sem bloquear render. ([swr.vercel.app][2])

### 1.2 SWRConfig global (client)

```tsx
// app/SwrProvider.tsx
'use client';
import { SWRConfig } from 'swr';

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher: async (url: string) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      revalidateIfStale: true,
      dedupingInterval: 1500,
      errorRetryInterval: 3000,
      shouldRetryOnError: (err: any) => !String(err?.message).includes('401'),
      provider: () => new Map(),
    }}>
      {children}
    </SWRConfig>
  );
}
```

> Em **RSC**, envolva as páginas com `<SWRProvider />` (client). Para **injetar dados iniciais**, use `SWRConfig.fallback` (ver §6). ([swr.vercel.app][3])

---

## 2) Camada de dados (hooks custom)

* Nunca espalhe URL/parsing em componentes.
* Crie hooks em `hooks/`, com **tipos** fortes, **DTO/normalização** e **opções** (ex.: `keepPreviousData`).

```ts
// hooks/useUser.ts
import useSWR, { type Fetcher } from 'swr';
type User = { id: string; name: string; avatar: string };
const fetcher: Fetcher<User, string> = (u) => fetch(u).then(r => r.json());

export function useUser() {
  return useSWR<User, Error>('/api/user', fetcher, { keepPreviousData: true });
}
```

---

## 3) Padrões de UX & custo

### 3.1 `keepPreviousData` (filtros/paginação)

Mantém dados anteriores enquanto a nova key carrega — sem “flash”. ([swr.vercel.app][3])

### 3.2 Polling **inteligente**

`refreshInterval` pode ser **função**: retorne `0` para parar quando o job finalizar. ([swr.vercel.app][1])

```tsx
useSWR(`/api/jobs/${id}`, fetcher, {
  refreshInterval: (job) =>
    !job || ['COMPLETED','FAILED'].includes(job.status) ? 0 : 2000
});
```

### 3.3 Revalidações automáticas

Revalidação **ao focar** e **ao reconectar** vêm ligadas por padrão — desligue em telas de alto custo. ([swr.vercel.app][1])

---

## 4) Pré-busca programática (instant nav)

Use **`preload`** fora do React (hover, interseção, roteamento) para encher o cache; depois `useSWR` lê instantaneamente. ([swr.vercel.app][5])

```ts
import { preload } from 'swr';
const fetcher = (u: string) => fetch(u).then(r => r.json());

export function prefetchUser(token: string) {
  preload(['/api/user', token], fetcher);
}
```

---

## 5) Tempo real (sem polling)

**`useSWRSubscription`** assina uma fonte push (WS/SSE) e atualiza o cache com cada evento. ([swr.vercel.app][6])

```ts
import useSWRSubscription from 'swr/subscription';

export function useLive<T>(key: string, open: () => WebSocket) {
  return useSWRSubscription<T>(key, (k, { next }) => {
    const ws = open();
    ws.onmessage = e => next(null, JSON.parse(e.data));
    ws.onerror = err => next(err as any);
    return () => ws.close();
  });
}
```

---

## 6) Next.js App Router — padrão **híbrido**

### 6.1 Fallback com **Promise** (Server → Client)

Busque no **Server**, injete a **Promise** no `fallback`; no Client, `useSWR` usa **Suspense** para aguardar a primeira resposta. Performance: streaming do HTML + hidratação com dados + reatividade SWR depois. ([swr.vercel.app][3])

```tsx
// app/layout.tsx (Server)
import { SWRProvider } from './SwrProvider';
import { SWRConfig } from 'swr';
import { getUser } from '@/lib/server-data';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR"><body>
      <SWRProvider>
        <SWRConfig value={{ fallback: { '/api/user': getUser() } }}>
          {children}
        </SWRConfig>
      </SWRProvider>
    </body></html>
  );
}
```

### 6.2 Server Actions / Route Handlers

Execute **mutação** no server (segurança/latência), e no cliente **invalide/atualize** com `mutate` as chaves relevantes. (Veja §7.)

---

## 7) Mutations — **padrão da equipe**

### 7.1 Quando usar o quê

* **`useSWRMutation`**: dispara **requisição remota** (POST/PUT/DELETE) manualmente.
* **`mutate`**: **atualiza/invalidade** o cache (optimistic, rollback, populateCache, revalidate).

> A doc permite `mutate(key, asyncFn)` (mutação remota), mas **nós preferimos** separar: `trigger()` para rede, `mutate()` para cache. ([swr.vercel.app][4])

```ts
import useSWRMutation from 'swr/mutation';

async function createPost(url: string, { arg }: { arg: { title: string; content: string }}) {
  const r = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(arg) });
  if (!r.ok) throw new Error('Falha ao criar');
  return r.json();
}

export function useCreatePost() {
  return useSWRMutation('/api/posts', createPost);
}
```

### 7.2 UI otimista **resiliente**

Use `optimisticData`, `rollbackOnError`, `populateCache` (pode ser função) e `revalidate` seletivo. ([swr.vercel.app][4])

```ts
import { useSWRConfig } from 'swr';

const { mutate } = useSWRConfig();
const temp = { id: `temp-${crypto.randomUUID()}`, title: 'Novo item' };

await mutate('/api/todos',
  (async () => {
    const r = await fetch('/api/todos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: temp.title }) });
    if (!r.ok) throw new Error('Falha');
    return r.json();
  })(),
  {
    optimisticData: (curr: any[] = []) => [temp, ...curr],
    rollbackOnError: true,
    populateCache: (created, curr: any[]) => [created, ...curr.filter(t => t.id !== temp.id)],
    revalidate: false
  }
);
```

### 7.3 Invalidação múltipla

Use **matcher** para revalidar várias keys (ex.: páginas de uma lista). ([swr.vercel.app][4])

```ts
mutate((key) => typeof key === 'string' && key.startsWith('/api/posts?page='), undefined, { revalidate: true });
```

---

## 8) Paginação & Infinito (2025)

`useSWRInfinite(getKey, fetcher, { keepPreviousData: true })`

* `getKey(index, previousPageData)` retorna `null` ao fim; use offset/cursor.
* `isLoading`: 1º load; `isValidating`: carregando próxima página/refresh. ([swr.vercel.app][3])

```tsx
import useSWRInfinite from 'swr/infinite';
const PAGE = 20;

const getKey = (i: number, prev: any[] | null) => {
  if (prev && prev.length === 0) return null;
  if (i === 0) return `/api/items?limit=${PAGE}`;
  const last = prev![prev!.length - 1];
  return `/api/items?cursor=${last.id}&limit=${PAGE}`;
};

export function Items() {
  const { data, size, setSize, isLoading, isValidating, error } =
    useSWRInfinite(getKey, (u) => fetch(u).then(r => r.json()), { keepPreviousData: true });

  if (isLoading && !data) return <Skeleton/>;
  if (error) return <ErrorBox/>;

  const pages = data ?? [];
  const items = pages.flat();
  const isEmpty = items.length === 0;
  const isReachingEnd = isEmpty || (pages.at(-1)?.length ?? 0) < PAGE;
  const isLoadingMore = isValidating || (size > 0 && typeof pages[size - 1] === 'undefined');

  return (
    <>
      {items.map((it: any) => <Item key={it.id} {...it}/>)}
      <button disabled={isLoadingMore || isReachingEnd} onClick={() => setSize(size + 1)}>
        {isLoadingMore ? 'Carregando…' : isReachingEnd ? 'Fim' : 'Carregar mais'}
      </button>
    </>
  );
}
```

---

## 9) Middleware (observabilidade/autenticação)

**Middleware** executa lógica **antes/depois** do hook: métricas, tracing, headers, retries, “laggy data”, etc. ([swr.vercel.app][7])

```ts
// swr/middlewares/retryMetrics.ts
import { Middleware, SWRHook } from 'swr';

export const retryMetricsMw: Middleware = (useNext: SWRHook) => (key, fetcher, config) => {
  const t0 = performance.now();
  return useNext(key, fetcher, {
    errorRetryInterval: 3000,
    shouldRetryOnError: (err) => !String(err?.message).includes('401'),
    ...config,
    onSuccess: (d, k, c) => { console.info('[SWR OK]', k, Math.round(performance.now() - t0), 'ms'); config?.onSuccess?.(d, k, c); },
    onError: (e, k, c) => { console.warn('[SWR ERR]', k, e); config?.onError?.(e, k, c); }
  });
};
// uso: useSWR(key, fetcher, { use: [retryMetricsMw] }) ou <SWRConfig value={{ use:[...] }}>
```

---

## 10) Multi-aba (BroadcastChannel)

```ts
// authChannel.ts
export const authChannel = new BroadcastChannel('auth');

// LogoutButton.tsx
import { useSWRConfig } from 'swr';
import { authChannel } from './authChannel';
export function LogoutButton() {
  const { mutate } = useSWRConfig();
  const onClick = async () => {
    await fetch('/api/logout', { method: 'POST' });
    mutate('/api/user', undefined, { revalidate: true });
    authChannel.postMessage({ type: 'LOGOUT' });
  };
  return <button onClick={onClick}>Sair</button>;
}
```

---

## 11) Testes

* **MSW** para mock de rede; **isole o cache** por teste com `provider: () => new Map()`.
* Polling: **fake timers**. (Apoiado pelo modelo de config/global da lib.) ([swr.vercel.app][7])

---

## 12) Segurança, A11y e Perf

* **Segurança**: não coloque **secrets** em arrays de `key`; limpe caches sensíveis no logout (matcher que zera tudo, se preciso). ([swr.vercel.app][4])
* **A11y/UX**: prefira **skeleton** a spinner; `aria-busy` em contêiner, `aria-live` para confirmações otimistas.
* **Custo/Perf**: ajuste `dedupingInterval`, `revalidateOnFocus` e prefira **subscription** a polling quando for “push”. ([swr.vercel.app][1])

---

## 13) TanStack Query × SWR (2025)

* SWR 2.x trouxe `useSWRMutation`, `keepPreviousData`, `preload`, DevTools — a lacuna reduziu. ([GitHub][8])
* TanStack ainda oferece **configurabilidade** fina (ex.: *gcTime*, plugins), enquanto SWR destaca **minimalismo** e integração **Next/Vercel**.
* Se a equipe já domina SWR e usa Next.js/App Router, **SWR é padrão** aqui.

---

## 14) Checklist por tela/feature

* Vai usar **Suspense**? Injete dados iniciais com **Promise no `fallback`**. ([swr.vercel.app][3])
* UX sem flash? `keepPreviousData: true`. ([swr.vercel.app][3])
* Revalidação ao focar/reconectar faz sentido? Ajuste por página. ([swr.vercel.app][1])
* Polling que para sozinho? `refreshInterval` **função**. ([swr.vercel.app][1])
* É tempo real? **`useSWRSubscription`**. ([swr.vercel.app][6])
* Vai pré-carregar navegação? **`preload`**. ([swr.vercel.app][5])
* Mutação afeta várias listas? `mutate(matcher, …)` + `populateCache`. ([swr.vercel.app][4])
* Observabilidade? **middleware**. ([swr.vercel.app][7])
* Warm-start/offline? Trocar `provider` por LRU + persistência leve (localStorage/IDB).

---

## 15) Referências (estado 2023–2025)

* **Mutation & Revalidation** (mutate global/bound, optimistic, populateCache, matcher). ([swr.vercel.app][4])
* **Prefetch `preload`**. ([swr.vercel.app][5])
* **Subscription `useSWRSubscription`**. ([swr.vercel.app][6])
* **Middleware**. ([swr.vercel.app][7])
* **Anúncio v2** (isLoading, keepPreviousData, useSWRMutation, DevTools). ([GitHub][8])
* **Padrões avançados** (keepPreviousData, fallback, key change). ([swr.vercel.app][3])

---

### Pronto ✅

Este é o **documento base** do Socialwise/Chatwit.
Qualquer exceção (ex.: tela ultra-barata/ultra-cara, offline-first, latência crítica) deve **explicar no PR** o desvio dos defaults acima e justificar **opções do SWR** alteradas.

[1]: https://swr.vercel.app/docs/revalidation?utm_source=chatgpt.com "Automatic Revalidation"
[2]: https://swr.vercel.app/?utm_source=chatgpt.com "SWR: React Hooks for Data Fetching"
[3]: https://swr.vercel.app/docs/advanced/understanding?utm_source=chatgpt.com "Understanding SWR"
[4]: https://swr.vercel.app/docs/mutation?utm_source=chatgpt.com "Mutation & Revalidation"
[5]: https://swr.vercel.app/docs/prefetching?utm_source=chatgpt.com "Prefetching Data"
[6]: https://swr.vercel.app/docs/subscription?utm_source=chatgpt.com "Subscription"
[7]: https://swr.vercel.app/docs/middleware?utm_source=chatgpt.com "Middleware"
[8]: https://github.com/vercel/swr/discussions/2272?utm_source=chatgpt.com "2.0.0 · vercel swr · Discussion #2272"





DOC OFICIAL:
Mutation & Revalidation
SWR provides the mutate and useSWRMutation APIs for mutating remote data and related cache.

mutate
There're 2 ways to use the mutate API to mutate the data, the global mutate API which can mutate any key and the bound mutate API which only can mutate the data of corresponding SWR hook.

Global Mutate
The recommended way to get the global mutator is to use the useSWRConfig hook:

import { useSWRConfig } from "swr"
 
function App() {
  const { mutate } = useSWRConfig()
  mutate(key, data, options)
}

You can also import it globally:

import { mutate } from "swr"
 
function App() {
  mutate(key, data, options)
}

Using global mutator only with the key parameter will not update the cache or trigger revalidation unless there is a mounted SWR hook using the same key.

Bound Mutate
Bound mutate is the short path to mutate the current key with data. Which key is bounded to the key passing to useSWR, and receive the data as the first argument.

It is functionally equivalent to the global mutate function in the previous section but does not require the key parameter:

import useSWR from 'swr'
 
function Profile () {
  const { data, mutate } = useSWR('/api/user', fetcher)
 
  return (
    <div>
      <h1>My name is {data.name}.</h1>
      <button onClick={async () => {
        const newName = data.name.toUpperCase()
        // send a request to the API to update the data
        await requestUpdateUsername(newName)
        // update the local data immediately and revalidate (refetch)
        // NOTE: key is not required when using useSWR's mutate as it's pre-bound
        mutate({ ...data, name: newName })
      }}>Uppercase my name!</button>
    </div>
  )
}

Revalidation
When you call mutate(key) (or just mutate() with the bound mutate API) without any data, it will trigger a revalidation (mark the data as expired and trigger a refetch) for the resource. This example shows how to automatically refetch the login info (e.g. inside <Profile/>) when the user clicks the “Logout” button:

import useSWR, { useSWRConfig } from 'swr'
 
function App () {
  const { mutate } = useSWRConfig()
 
  return (
    <div>
      <Profile />
      <button onClick={() => {
        // set the cookie as expired
        document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
 
        // tell all SWRs with this key to revalidate
        mutate('/api/user')
      }}>
        Logout
      </button>
    </div>
  )
}

It broadcasts to SWR hooks under the same cache provider scope. If no cache provider exists, it will broadcast to all SWR hooks.

API
Parameters
key: same as useSWR's key, but a function behaves as a filter function
data: data to update the client cache, or an async function for the remote mutation
options: accepts the following options
optimisticData: data to immediately update the client cache, or a function that receives current data and returns the new client cache data, usually used in optimistic UI.
revalidate = true: should the cache revalidate once the asynchronous update resolves. If set to a function, the function receives data and key.
populateCache = true: should the result of the remote mutation be written to the cache, or a function that receives new result and current result as arguments and returns the mutation result.
rollbackOnError = true: should the cache rollback if the remote mutation errors, or a function that receives the error thrown from fetcher as arguments and returns a boolean whether should rollback or not.
throwOnError = true: should the mutate call throw the error when fails.
Return Values
mutate returns the results the data parameter has been resolved. The function passed to mutate will return an updated data which is used to update the corresponding cache value. If there is an error thrown while executing the function, the error will be thrown so it can be handled appropriately.

try {
  const user = await mutate('/api/user', updateUser(newUser))
} catch (error) {
  // Handle an error while updating the user here
}

useSWRMutation
SWR also provides useSWRMutation as a hook for remote mutations. The remote mutations are only triggered manually, instead of automatically like useSWR.

Also, this hook doesn’t share states with other useSWRMutation hooks.

import useSWRMutation from 'swr/mutation'
 
// Fetcher implementation.
// The extra argument will be passed via the `arg` property of the 2nd parameter.
// In the example below, `arg` will be `'my_token'`
async function updateUser(url, { arg }: { arg: string }) {
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${arg}`
    }
  })
}
 
function Profile() {
  // A useSWR + mutate like API, but it will not start the request automatically.
  const { trigger } = useSWRMutation('/api/user', updateUser, options)
 
  return <button onClick={() => {
    // Trigger `updateUser` with a specific argument.
    trigger('my_token')
  }}>Update User</button>
}

API
Parameters
key: same as mutate's key
fetcher(key, { arg }): an async function for remote mutation
options: an optional object with the following properties:
optimisticData: same as mutate's optimisticData
revalidate = true: same as mutate's revalidate
populateCache = false: same as mutate's populateCache, but the default is false
rollbackOnError = true: same as mutate's rollbackOnError
throwOnError = true: same as mutate's throwOnError
onSuccess(data, key, config):　 callback function when a remote mutation has been finished successfully
onError(err, key, config): callback function when a remote mutation has returned an error
Return Values
data: data for the given key returned from fetcher
error: error thrown by fetcher (or undefined)
trigger(arg, options): a function to trigger a remote mutation
reset: a function to reset the state (data, error, isMutating)
isMutating: if there's an ongoing remote mutation
Basic Usage
import useSWRMutation from 'swr/mutation'
 
async function sendRequest(url, { arg }: { arg: { username: string }}) {
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(arg)
  }).then(res => res.json())
}
 
function App() {
  const { trigger, isMutating } = useSWRMutation('/api/user', sendRequest, /* options */)
 
  return (
    <button
      disabled={isMutating}
      onClick={async () => {
        try {
          const result = await trigger({ username: 'johndoe' }, /* options */)
        } catch (e) {
          // error handling
        }
      }}
    >
      Create User
    </button>
  )
}

If you want to use the mutation results in rendering, you can get them from the return values of useSWRMutation.

const { trigger, data, error } = useSWRMutation('/api/user', sendRequest)

useSWRMutation shares a cache store with useSWR, so it can detect and avoid race conditions between useSWR. It also supports mutate's functionalities like optimistic updates and rollback on errors. You can pass these options useSWRMutation and its trigger function.

const { trigger } = useSWRMutation('/api/user', updateUser, {
  optimisticData: current => ({ ...current, name: newName })
})
 
// or
 
trigger(newName, {
  optimisticData: current => ({ ...current, name: newName })
})

Defer loading data until needed
You can also use useSWRMutation for loading data. useSWRMutation won't start requesting until trigger is called, so you can defer loading data when you actually need it.

import { useState } from 'react'
import useSWRMutation from 'swr/mutation'
 
const fetcher = url => fetch(url).then(res => res.json())
 
const Page = () => {
  const [show, setShow] = useState(false)
  // data is undefined until trigger is called
  const { data: user, trigger } = useSWRMutation('/api/user', fetcher);
 
  return (
    <div>
      <button onClick={() => {
        trigger();
        setShow(true);
      }}>Show User</button>
      {show && user ? <div>{user.name}</div> : null}
    </div>
  );
}

Optimistic Updates
In many cases, applying local mutations to data is a good way to make changes feel faster — no need to wait for the remote source of data.

With the optimisticData option, you can update your local data manually, while waiting for the remote mutation to finish. Composing rollbackOnError you can also control when to rollback the data.

import useSWR, { useSWRConfig } from 'swr'
 
function Profile () {
  const { mutate } = useSWRConfig()
  const { data } = useSWR('/api/user', fetcher)
 
  return (
    <div>
      <h1>My name is {data.name}.</h1>
      <button onClick={async () => {
        const newName = data.name.toUpperCase()
        const user = { ...data, name: newName }
        const options = {
          optimisticData: user,
          rollbackOnError(error) {
            // If it's timeout abort error, don't rollback
            return error.name !== 'AbortError'
          },
        }
 
        // updates the local data immediately
        // send a request to update the data
        // triggers a revalidation (refetch) to make sure our local data is correct
        mutate('/api/user', updateFn(user), options);
      }}>Uppercase my name!</button>
    </div>
  )
}

The updateFn should be a promise or asynchronous function to handle the remote mutation, it should return updated data.

You can also pass a function to optimisticData to make it depending on the current data:

import useSWR, { useSWRConfig } from 'swr'
 
function Profile () {
  const { mutate } = useSWRConfig()
  const { data } = useSWR('/api/user', fetcher)
 
  return (
    <div>
      <h1>My name is {data.name}.</h1>
      <button onClick={async () => {
        const newName = data.name.toUpperCase()
        mutate('/api/user', updateUserName(newName), {
          optimisticData: user => ({ ...user, name: newName }),
          rollbackOnError: true
        });
      }}>Uppercase my name!</button>
    </div>
  )
}

You can also create the same thing with useSWRMutation and trigger:

import useSWRMutation from 'swr/mutation'
 
function Profile () {
  const { trigger } = useSWRMutation('/api/user', updateUserName)
 
  return (
    <div>
      <h1>My name is {data.name}.</h1>
      <button onClick={async () => {
        const newName = data.name.toUpperCase()
 
        trigger(newName, {
          optimisticData: user => ({ ...user, name: newName }),
          rollbackOnError: true
        })
      }}>Uppercase my name!</button>
    </div>
  )
}

Rollback on Errors
When you have optimisticData set, it’s possible that the optimistic data gets displayed to the user, but the remote mutation fails. In this case, you can leverage rollbackOnError to revert the local cache to the previous state, to make sure the user is seeing the correct data.

Update Cache After Mutation
Sometimes, the remote mutation request directly returns the updated data, so there is no need to do an extra fetch to load it. You can enable the populateCache option to update the cache for useSWR with the response of the mutation:

const updateTodo = () => fetch('/api/todos/1', {
  method: 'PATCH',
  body: JSON.stringify({ completed: true })
})
 
mutate('/api/todos', updateTodo, {
  populateCache: (updatedTodo, todos) => {
    // filter the list, and return it with the updated item
    const filteredTodos = todos.filter(todo => todo.id !== '1')
    return [...filteredTodos, updatedTodo]
  },
  // Since the API already gives us the updated information,
  // we don't need to revalidate here.
  revalidate: false
})

Or with the useSWRMutation hook:

useSWRMutation('/api/todos', updateTodo, {
  populateCache: (updatedTodo, todos) => {
    // filter the list, and return it with the updated item
    const filteredTodos = todos.filter(todo => todo.id !== '1')
    return [...filteredTodos, updatedTodo]
  },
  // Since the API already gives us the updated information,
  // we don't need to revalidate here.
  revalidate: false
})

When combined with optimisticData and rollbackOnError, you’ll get a perfect optimistic UI experience.

Avoid Race Conditions
Both mutate and useSWRMutation can avoid race conditions between useSWR. For example,

function Profile() {
  const { data } = useSWR('/api/user', getUser, { revalidateInterval: 3000 })
  const { trigger } = useSWRMutation('/api/user', updateUser)
 
  return <>
    {data ? data.username : null}
    <button onClick={() => trigger()}>Update User</button>
  </>
}

The normal useSWR hook might refresh its data any time due to focus, polling, or other conditions. This way the displayed username can be as fresh as possible. However, since we have a mutation there that can happen at the nearly same time of a refetch of useSWR, there could be a race condition that getUser request starts earlier, but takes longer than updateUser.

Luckily, useSWRMutation handles this for you automatically. After the mutation, it will tell useSWR to ditch the ongoing request and revalidate, so the stale data will never be displayed.

Mutate Based on Current Data
Sometimes, you want to update a part of your data based on the current data.

With mutate, you can pass an async function which will receive the current cached value, if any, and returns an updated document.

mutate('/api/todos', async todos => {
  // let's update the todo with ID `1` to be completed,
  // this API returns the updated data
  const updatedTodo = await fetch('/api/todos/1', {
    method: 'PATCH',
    body: JSON.stringify({ completed: true })
  })
 
  // filter the list, and return it with the updated item
  const filteredTodos = todos.filter(todo => todo.id !== '1')
  return [...filteredTodos, updatedTodo]
// Since the API already gives us the updated information,
// we don't need to revalidate here.
}, { revalidate: false })

Mutate Multiple Items
The global mutate API accepts a filter function, which accepts key as the argument and returns which keys to revalidate. The filter function is applied to all the existing cache keys:

import { mutate } from 'swr'
// Or from the hook if you customized the cache provider:
// { mutate } = useSWRConfig()
 
mutate(
  key => typeof key === 'string' && key.startsWith('/api/item?id='),
  undefined,
  { revalidate: true }
)

This also works with any key type like an array. The mutation matches all keys, of which the first element is 'item'.

useSWR(['item', 123], ...)
useSWR(['item', 124], ...)
useSWR(['item', 125], ...)
 
mutate(
  key => Array.isArray(key) && key[0] === 'item',
  undefined,
  { revalidate: false }
)

The filter function is applied to all existing cache keys, so you should not assume the shape of keys when using multiple shapes of keys.

// ✅ matching array key
mutate((key) => key[0].startsWith('/api'), data)
// ✅ matching string key
mutate((key) => typeof key === 'string' && key.startsWith('/api'), data)
 
// ❌ ERROR: mutate uncertain keys (array or string)
mutate((key: any) => /\/api/.test(key.toString()))

You can use the filter function to clear all cache data, which is useful when logging out:

const clearCache = () => mutate(
  () => true,
  undefined,
  { revalidate: false }
)
 
// ...clear cache on logout
clearCache()


Data Fetching
const { data, error } = useSWR(key, fetcher)

This is the very fundamental API of SWR. The fetcher here is an async function that accepts the key of SWR, and returns the data.

The returned value will be passed as data, and if it throws, it will be caught as error.

Note that fetcher can be omitted from the parameters if it's provided globally.

Fetch
You can use any library to handle data fetching, for example a fetch polyfill developit/unfetch(opens in a new tab):

import fetch from 'unfetch'
 
const fetcher = url => fetch(url).then(r => r.json())
 
function App () {
  const { data, error } = useSWR('/api/data', fetcher)
  // ...
}

If you are using Next.js, you don't need to import this polyfill:
New Built-In Polyfills: fetch(), URL, and Object.assign

Axios
import axios from 'axios'
 
const fetcher = url => axios.get(url).then(res => res.data)
 
function App () {
  const { data, error } = useSWR('/api/data', fetcher)
  // ...
}

GraphQL
Or using GraphQL with libs like graphql-request(opens in a new tab):

import { request } from 'graphql-request'
 
const fetcher = query => request('/api/graphql', query)
 
function App () {
  const { data, error } = useSWR(
    `{
      Movie(title: "Inception") {
        releaseDate
        actors {
          name
        }
      }
    }`,
    fetcher
  )
  // ...
}

If you want to pass variables to a GraphQL query, check out Multiple Arguments.


Automatic Revalidation
If you want to manually revalidate the data, check mutation.

Revalidate on Focus
When you re-focus a page or switch between tabs, SWR automatically revalidates data.

This can be useful to immediately synchronize to the latest state. This is helpful for refreshing data in scenarios like stale mobile tabs, or laptops that went to sleep.

Video: using focus revalidation to automatically sync login state between pages.
This feature is enabled by default. You can disable it via the revalidateOnFocus option.

Revalidate on Interval
In many cases, data changes because of multiple devices, multiple users, multiple tabs. How can we over time update the data on screen?

SWR will give you the option to automatically refetch data. It’s smart which means refetching will only happen if the component associated with the hook is on screen.

Video: when a user makes a change, both sessions will eventually render the same data.
You can enable it by setting a refreshInterval value:

useSWR('/api/todos', fetcher, { refreshInterval: 1000 })

There're also options such as refreshWhenHidden and refreshWhenOffline. Both are disabled by default so SWR won't fetch when the webpage is not on screen, or there's no network connection.

Revalidate on Reconnect
It's useful to also revalidate when the user is back online. This scenario happens a lot when the user unlocks their computer, but the internet is not yet connected at the same moment.

To make sure the data is always up-to-date, SWR automatically revalidates when network recovers.

This feature is enabled by default. You can disable it via the revalidateOnReconnect option.

Disable Automatic Revalidations
If the resource is immutable, that will never change if we revalidate again, we can disable all kinds of automatic revalidations for it.

Since version 1.0, SWR provides a helper hook useSWRImmutable to mark the resource as immutable:

import useSWRImmutable from 'swr/immutable'
 
// ...
useSWRImmutable(key, fetcher, options)

It has the same API interface as the normal useSWR hook. You can also do the same thing by disabling the following revalidation options:

useSWR(key, fetcher, {
  revalidateIfStale: false,
  revalidateOnFocus: false,
  revalidateOnReconnect: false
})
 
// equivalent to
useSWRImmutable(key, fetcher)

The revalidateIfStale controls if SWR should revalidate when it mounts and there is stale data.

These 2 hooks above do the exact same thing. Once the data is cached, they will never request it again.

Revalidate on Mount
It's useful to force override SWR revalidation on mounting. By default, the value of revalidateOnMount is set to undefined.

A SWR hook mounts as:

First it checks if revalidateOnMount is defined. It starts request if it's true, stop if it's false.
revalidateIfStale useful to control the mount behaviour. By default revalidateIfStale is set to true.

If revalidateIfStale is set to true it only refetches if there's any cache data else it will not refetch.

Arguments
By default, key will be passed to fetcher as the argument. So the following 3 expressions are equivalent:

useSWR('/api/user', () => fetcher('/api/user'))
useSWR('/api/user', url => fetcher(url))
useSWR('/api/user', fetcher)

Multiple Arguments
In some scenarios, it's useful to pass multiple arguments (can be any value or object) to the fetcher function. For example an authorized fetch request:

useSWR('/api/user', url => fetchWithToken(url, token))

This is incorrect. Because the identifier (also the cache key) of the data is '/api/user', even if token changes, SWR will still use the same key and return the wrong data.

Instead, you can use an array as the key parameter, which contains multiple arguments of fetcher:

const { data: user } = useSWR(['/api/user', token], ([url, token]) => fetchWithToken(url, token))

The fetcher function accepts the key parameter as is, and the cache key will also be associated with the entire key argument. In the above example, url and token are both tied to the cache key.

In the previous versions (< 2.0.0), The fetcher function will receive the spreaded arguments from original key when the key argument is array type. E.g., key [url, token] will become 2 arguments (url, token) for fetcher function.

Passing Objects
Since SWR 1.1.0, object-like keys will be serialized under the hood automatically.

Say you have another function that fetches data with a user scope: fetchWithUser(api, user). You can do the following:

const { data: user } = useSWR(['/api/user', token], fetchWithToken)
 
// ...and then pass it as an argument to another useSWR hook
const { data: orders } = useSWR(user ? ['/api/orders', user] : null, fetchWithUser)

You can directly pass an object as the key, and fetcher will receive that object too:

const { data: orders } = useSWR({ url: '/api/orders', args: user }, fetcher)

Conditional Fetching
Conditional
Use null or pass a function as key to conditionally fetch data. If the function throws or returns a falsy value, SWR will not start the request.

// conditionally fetch
const { data } = useSWR(shouldFetch ? '/api/data' : null, fetcher)
 
// ...or return a falsy value
const { data } = useSWR(() => shouldFetch ? '/api/data' : null, fetcher)
 
// ...or throw an error when user.id is not defined
const { data } = useSWR(() => '/api/data?uid=' + user.id, fetcher)

Dependent
SWR also allows you to fetch data that depends on other data. It ensures the maximum possible parallelism (avoiding waterfalls), as well as serial fetching when a piece of dynamic data is required for the next data fetch to happen.

function MyProjects () {
  const { data: user } = useSWR('/api/user')
  const { data: projects } = useSWR(() => '/api/projects?uid=' + user.id)
  // When passing a function, SWR will use the return
  // value as `key`. If the function throws or returns
  // falsy, SWR will know that some dependencies are not
  // ready. In this case `user.id` throws when `user`
  // isn't loaded.
 
  if (!projects) return 'loading...'
  return 'You have ' + projects.length + ' projects'
}


TypeScript
SWR is friendly for apps written in TypeScript, with type safety out of the box.

Basic Usage
By default, SWR will also infer the argument types of fetcher from key, so you can have the preferred types automatically.

useSWR
// `key` is inferred to be `string`
useSWR('/api/user', key => {})
useSWR(() => '/api/user', key => {})
 
// `key` will be inferred as { a: string; b: { c: string; d: number } }
useSWR({ a: '1', b: { c: '3', d: 2 } }, key => {})
useSWR(() => ({ a: '1', b: { c: '3', d: 2 } }), key => {})
 
// `arg0` will be inferred as string.  `arg1` will be inferred as number
useSWR(['user', 8], ([arg0, arg1]) => {})
useSWR(() => ['user', 8], ([arg0, arg1]) => {})

You can also explicitly specify the types for key and fetcher's arguments.

import useSWR, { Fetcher } from 'swr'
 
const uid = '<user_id>'
const fetcher: Fetcher<User, string> = (id) => getUserById(id)
 
const { data } = useSWR(uid, fetcher)
// `data` will be `User | undefined`.

By default, the error thrown inside the fetcher function has type any. The type can also be explicitly specified.

const { data, error } = useSWR<User, Error>(uid, fetcher);
// `data` will be `User | undefined`.
// `error` will be `Error | undefined`.

useSWRInfinite
Same for swr/infinite, you can either rely on the automatic type inference or explicitly specify the types by yourself.

import { SWRInfiniteKeyLoader } from 'swr/infinite'
 
const getKey: SWRInfiniteKeyLoader = (index, previousPageData) => {
  // ...
}
 
const { data } = useSWRInfinite(getKey, fetcher)

useSWRSubscription
Inline subscribe function and manually specify the type of next using SWRSubscriptionOptions.
import useSWRSubscription from 'swr/subscription'
import type { SWRSubscriptionOptions } from 'swr/subscription'
 
const { data, error } = useSWRSubscription('key', 
  (key, { next }: SWRSubscriptionOptions<number, Error>) => {
  //^ key will be inferred as `string`
  //....
  })
  return {
    data,
    //^ data will be inferred as `number | undefined`
    error
    //^ error will be inferred as `Error | undefined`
  }
}

declare subscribe function using SWRSubscription
import useSWRSubscription from 'swr/subscription'
import type { SWRSubscription } from 'swr/subscription'
 
/** 
 * The first generic is Key
 * The second generic is Data
 * The Third generic is Error
 */
const sub: SWRSubscription<string, number, Error> = (key, { next }) => {                         
  //......
}
const { data, error } = useSWRSubscription('key', sub)

Generics
Specifying the type of data is easy. By default, it will use the return type of fetcher (with undefined for the non-ready state) as the data type, but you can also pass it as a parameter:

// 🔹 A. Use a typed fetcher:
// `getUser` is `(endpoint: string) => User`.
const { data } = useSWR('/api/user', getUser)
 
// 🔹 B. Specify the data type:
// `fetcher` is generally returning `any`.
const { data } = useSWR<User>('/api/user', fetcher)

If you want to add types for other options of SWR, you can also import those types directly:

import useSWR from 'swr'
import type { SWRConfiguration } from 'swr'
 
const config: SWRConfiguration = {
  fallbackData: "fallback",
  revalidateOnMount: false
  // ...
}
 
const { data } = useSWR<string[]>('/api/data', fetcher, config)

Middleware Types
There're some extra type definitions you can import to help adding types to your custom middleware.

import useSWR, { Middleware, SWRHook } from 'swr'
 
const swrMiddleware: Middleware = (useSWRNext: SWRHook) => (key, fetcher, config) => {
  // ...
  return useSWRNext(key, fetcher, config)
}


Middleware
Upgrade to the latest version (≥ 1.0.0) to use this feature.

The middleware feature is a new addition in SWR 1.0 that enables you to execute logic before and after SWR hooks.

Usage
Middleware receive the SWR hook and can execute logic before and after running it. If there are multiple middleware, each middleware wraps the next middleware. The last middleware in the list will receive the original SWR hook useSWR.

API
Notes: The function name shouldn't be capitalized (e.g. myMiddleware instead of MyMiddleware) or React lint rules will throw Rules of Hook error

TypeScript(opens in a new tab)

function myMiddleware (useSWRNext) {
  return (key, fetcher, config) => {
    // Before hook runs...
 
    // Handle the next middleware, or the `useSWR` hook if this is the last one.
    const swr = useSWRNext(key, fetcher, config)
 
    // After hook runs...
    return swr
  }
}

You can pass an array of middleware as an option to SWRConfig or useSWR:

<SWRConfig value={{ use: [myMiddleware] }}>
 
// or...
 
useSWR(key, fetcher, { use: [myMiddleware] })

Extend
Middleware will be extended like regular options. For example:

function Bar () {
  useSWR(key, fetcher, { use: [c] })
  // ...
}
 
function Foo() {
  return (
    <SWRConfig value={{ use: [a] }}>
      <SWRConfig value={{ use: [b] }}>
        <Bar/>
      </SWRConfig>
    </SWRConfig>
  )
}

is equivalent to:

useSWR(key, fetcher, { use: [a, b, c] })

Multiple Middleware
Each middleware wraps the next middleware, and the last one just wraps the SWR hook. For example:

useSWR(key, fetcher, { use: [a, b, c] })

The order of middleware executions will be a → b → c, as shown below:

enter a
  enter b
    enter c
      useSWR()
    exit  c
  exit  b
exit  a

Examples
Request Logger
Let's build a simple request logger middleware as an example. It prints out all the fetcher requests sent from this SWR hook. You can also use this middleware for all SWR hooks by adding it to SWRConfig.

function logger(useSWRNext) {
  return (key, fetcher, config) => {
    // Add logger to the original fetcher.
    const extendedFetcher = (...args) => {
      console.log('SWR Request:', key)
      return fetcher(...args)
    }
 
    // Execute the hook with the new fetcher.
    return useSWRNext(key, extendedFetcher, config)
  }
}
 
// ... inside your component
useSWR(key, fetcher, { use: [logger] })

Every time the request is fired, it outputs the SWR key to the console:

SWR Request: /api/user1
SWR Request: /api/user2

Keep Previous Result
Sometimes you want the data returned by useSWR to be "laggy". Even if the key changes, you still want it to return the previous result until the new data has loaded.

This can be built as a laggy middleware together with useRef. In this example, we are also going to extend the returned object of the useSWR hook:

import { useRef, useEffect, useCallback } from 'react'
 
// This is a SWR middleware for keeping the data even if key changes.
function laggy(useSWRNext) {
  return (key, fetcher, config) => {
    // Use a ref to store previous returned data.
    const laggyDataRef = useRef()
 
    // Actual SWR hook.
    const swr = useSWRNext(key, fetcher, config)
 
    useEffect(() => {
      // Update ref if data is not undefined.
      if (swr.data !== undefined) {
        laggyDataRef.current = swr.data
      }
    }, [swr.data])
 
    // Expose a method to clear the laggy data, if any.
    const resetLaggy = useCallback(() => {
      laggyDataRef.current = undefined
    }, [])
 
    // Fallback to previous data if the current data is undefined.
    const dataOrLaggyData = swr.data === undefined ? laggyDataRef.current : swr.data
 
    // Is it showing previous data?
    const isLagging = swr.data === undefined && laggyDataRef.current !== undefined
 
    // Also add a `isLagging` field to SWR.
    return Object.assign({}, swr, {
      data: dataOrLaggyData,
      isLagging,
      resetLaggy,
    })
  }
}

When you need a SWR hook to be laggy, you can then use this middleware:

const { data, isLagging, resetLaggy } = useSWR(key, fetcher, { use: [laggy] })

Serialize Object Keys
Since SWR 1.1.0, object-like keys will be serialized under the hood automatically.

In older versions (< 1.1.0), SWR shallowly compares the arguments on every render, and triggers revalidation if any of them has changed. If you are passing serializable objects as the key. You can serialize object keys to ensure its stability, a simple middleware can help:

function serialize(useSWRNext) {
  return (key, fetcher, config) => {
    // Serialize the key.
    const serializedKey = Array.isArray(key) ? JSON.stringify(key) : key
 
    // Pass the serialized key, and unserialize it in fetcher.
    return useSWRNext(serializedKey, (k) => fetcher(...JSON.parse(k)), config)
  }
}
 
// ...
useSWR(['/api/user', { id: '73' }], fetcher, { use: [serialize] })
 
// ... or enable it globally with
<SWRConfig value={{ use: [serialize] }}>

You don’t need to worry that object might change between renders. It’s always serialized to the same string, and the fetcher will still receive those object arguments.

Furthermore, you can use libs like fast-json-stable-stringify(opens in a new tab) instead of JSON.stringify — faster and stabler.