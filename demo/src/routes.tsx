import type { RouteObject } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

import { Home } from './pages/Home'
import { ModalPay } from './pages/ModalPay'
import { TabA } from './pages/TabA'
import { TabB } from './pages/TabB'
import { TabsLayout } from './pages/TabsLayout'
import { AnimPage } from './pages/AnimPage'
import { StepB } from './pages/StepB'
import { StepC } from './pages/StepC'

const tabChildren: RouteObject[] = [
  { index: true, element: <TabA /> },
  { path: 'a', element: <TabA /> },
  { path: 'b', element: <TabB /> },
]

export const routes: RouteObject[] = [
  {
    element: (
      <div className="app-shell">
        <main className="app-main">
          <AnimatedOutlet />
        </main>
      </div>
    ),
    children: [
      { index: true, element: <Home /> },

      /** 方法跳转：页面裸放，动画靠 push/replace 传 transition */
      {
        path: 'push',
        children: [
          { path: 'cover', element: <AnimPage title="Cover" testId="cover-page" /> },
          { path: 'detail', element: <AnimPage title="Detail" testId="detail-page" /> },
          { path: 'slide', element: <AnimPage title="Slide" testId="slide-page" /> },
          { path: 'fade', element: <AnimPage title="Fade" testId="fade-page" /> },
          { path: 'scale', element: <AnimPage title="Scale" testId="scale-page" /> },
          { path: 'modal', element: <ModalPay /> },
          { path: 'tabs', handle: { transition: 'fade' }, element: <TabsLayout basePath="/push/tabs" />, children: tabChildren },
          { path: 'step-b', element: <StepB /> },
          { path: 'step-c', element: <StepC /> },
        ],
      },

      /** 组件包裹：动画在 routes 里用 AnimatedOutlet / handle 声明 */
      {
        path: 'wrap',
        children: [
          {
            path: 'cover',
            handle: { transition: 'cover' },
            element: (
              <AnimatedOutlet transition="cover">
                <AnimPage title="Cover" testId="cover-page" transitionOverride="cover" />
              </AnimatedOutlet>
            ),
          },
          { path: 'detail', element: <AnimPage title="Detail" testId="detail-page" /> },
          {
            path: 'slide',
            handle: { transition: 'slide' },
            element: (
              <AnimatedOutlet transition="slide">
                <AnimPage title="Slide" testId="slide-page" transitionOverride="slide" />
              </AnimatedOutlet>
            ),
          },
          {
            path: 'fade',
            handle: { transition: 'fade' },
            element: (
              <AnimatedOutlet transition="fade">
                <AnimPage title="Fade" testId="fade-page" transitionOverride="fade" />
              </AnimatedOutlet>
            ),
          },
          {
            path: 'scale',
            handle: { transition: 'scale' },
            element: (
              <AnimatedOutlet transition="scale">
                <AnimPage title="Scale" testId="scale-page" transitionOverride="scale" />
              </AnimatedOutlet>
            ),
          },
          {
            path: 'modal',
            handle: { transition: 'modal' },
            element: (
              <AnimatedOutlet transition="modal">
                <ModalPay />
              </AnimatedOutlet>
            ),
          },
          {
            path: 'tabs',
            handle: { transition: 'fade' },
            element: <TabsLayout basePath="/wrap/tabs" />,
            children: tabChildren,
          },
          { path: 'step-b', element: <StepB /> },
          { path: 'step-c', element: <StepC /> },
        ],
      },
    ],
  },
]
