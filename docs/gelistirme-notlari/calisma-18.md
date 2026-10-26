
http://localhost:5173/admin/products bulinkte aşağıdaki hataları consoleye alıyorum. Bunları çöz. Ama sayfa düzgün çalışıyor bunlar console hatalar. 


react-dom_client.js?v=922e8d02:14338 Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
products:1 Failed to decode downloaded font: https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap
products:1 OTS parsing error: invalid sfntVersion: 791289955
ProductManagement.jsx:328 In HTML, <div> cannot be a child of <tbody>.
This will cause a hydration error.

  ...
    <Routes>
      <RenderedRoute match={{...}} routeContext={{outlet:null, ...}}>
        <ProtectedRoute allowedRoles={[...]}>
          <AdminLayout>
            <div className="flex min-h...">
              <Sidebar>
              <div className="flex-1 fle...">
                <header>
                <main className="flex-1 ove...">
                  <Routes>
                    <RenderedRoute match={{...}} routeContext={{outlet:null, ...}}>
                      <ProductManagement>
                        <div className="p-10 space...">
                          <div>
                          <div className="card-premium">
                            <table className="w-full tex...">
                              <thead>
>                             <tbody className="divide-y divide-gray-50">
                                <DndContext sensors={[...]} collisionDetection={function closestCenter} ...>
                                  <SortableContext>
                                  <RestoreFocus>
                                  <Accessibility hiddenTextDescribedById="DndDescrib...">
                                    <HiddenText id="DndDescrib..." value={"\n    To..."}>
>                                     <div id="DndDescribedBy-0" style={{display:"none"}}>
                                    ...
                            ...

validateDOMNesting @ react-dom_client.js?v=922e8d02:1773
completeWork @ react-dom_client.js?v=922e8d02:6335
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
completeUnitOfWork @ react-dom_client.js?v=922e8d02:8492
performUnitOfWork @ react-dom_client.js?v=922e8d02:8431
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<div>
exports.createElement @ react.js?v=922e8d02:606
HiddenText @ core.esm-CGVjLg6J.js?v=922e8d02:11
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<HiddenText>
exports.createElement @ react.js?v=922e8d02:606
Accessibility @ core.esm-CGVjLg6J.js?v=922e8d02:136
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<Accessibility>
exports.createElement @ react.js?v=922e8d02:606
DndContext @ core.esm-CGVjLg6J.js?v=922e8d02:2299
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
updateSimpleMemoComponent @ react-dom_client.js?v=922e8d02:5432
updateMemoComponent @ react-dom_client.js?v=922e8d02:5407
beginWork @ react-dom_client.js?v=922e8d02:6210
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<DndContext>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
(anonymous) @ ProductManagement.jsx:328
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<ProductManagement>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
(anonymous) @ AdminLayout.jsx:63
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<AdminLayout>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
(anonymous) @ App.jsx:34
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<AppRoutes>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
App @ App.jsx:58
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<App>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
(anonymous) @ main.jsx:8
ProductManagement.jsx:322 <tbody> cannot contain a nested <div>.
See this log for the ancestor stack trace.
(anonymous) @ react-dom_client.js?v=922e8d02:1775
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
validateDOMNesting @ react-dom_client.js?v=922e8d02:1774
completeWork @ react-dom_client.js?v=922e8d02:6335
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
completeUnitOfWork @ react-dom_client.js?v=922e8d02:8492
performUnitOfWork @ react-dom_client.js?v=922e8d02:8431
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<tbody>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
(anonymous) @ ProductManagement.jsx:322
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<ProductManagement>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
(anonymous) @ AdminLayout.jsx:63
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<AdminLayout>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
(anonymous) @ App.jsx:34
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<AppRoutes>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
App @ App.jsx:58
react_stack_bottom_frame @ react-dom_client.js?v=922e8d02:12868
renderWithHooksAgain @ react-dom_client.js?v=922e8d02:4268
renderWithHooks @ react-dom_client.js?v=922e8d02:4219
updateFunctionComponent @ react-dom_client.js?v=922e8d02:5569
beginWork @ react-dom_client.js?v=922e8d02:6140
runWithFiberInDEV @ react-dom_client.js?v=922e8d02:851
performUnitOfWork @ react-dom_client.js?v=922e8d02:8429
workLoopSync @ react-dom_client.js?v=922e8d02:8325
renderRootSync @ react-dom_client.js?v=922e8d02:8309
performWorkOnRoot @ react-dom_client.js?v=922e8d02:7957
performWorkOnRootViaSchedulerTask @ react-dom_client.js?v=922e8d02:9059
performWorkUntilDeadline @ react-dom_client.js?v=922e8d02:36
<App>
exports.jsxDEV @ react_jsx-dev-runtime.js?v=922e8d02:193
(anonymous) @ main.jsx:8
