import type { RouteObject } from 'react-router-dom'
import { AnimatedOutlet } from 'react-router-dom-animate'

import { Home } from './pages/Home'
import { ModalPay } from './pages/ModalPay'
import { TabA } from './pages/TabA'
import { TabB } from './pages/TabB'
import { TabC } from './pages/TabC'
import { TabsLayout } from './pages/TabsLayout'
import { TabsIndicatorLayout } from './pages/TabsIndicatorLayout'
import { CatalogLayout, CatalogList, CatalogDetail } from './pages/CatalogLayout'
import { AnimPage } from './pages/AnimPage'

const tabChildren: RouteObject[] = [
  { index: true, handle: { tabIndex: 0 }, element: <TabA /> },
  { path: 'a', handle: { tabIndex: 0 }, element: <TabA /> },
  { path: 'b', handle: { tabIndex: 1 }, element: <TabB /> },
]

const tabSlideChildren: RouteObject[] = [
  { index: true, handle: { tabIndex: 0 }, element: <TabA /> },
  { path: 'a', handle: { tabIndex: 0 }, element: <TabA /> },
  { path: 'b', handle: { tabIndex: 1 }, element: <TabB /> },
  { path: 'c', handle: { tabIndex: 2 }, element: <TabC /> },
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

      {
        path: 'push',
        children: [
          { path: 'cover', element: <AnimPage title="Cover" testId="cover-page" /> },
          { path: 'detail', element: <AnimPage title="Detail" testId="detail-page" /> },
          { path: 'slide', element: <AnimPage title="Slide" testId="slide-page" /> },
          { path: 'fade', element: <AnimPage title="Fade" testId="fade-page" /> },
          { path: 'scale', element: <AnimPage title="Scale" testId="scale-page" /> },
          { path: 'modal', element: <ModalPay /> },
          {
            path: 'tabs',
            handle: { transition: 'fade', tabs: true },
            element: <TabsLayout basePath="/push/tabs" transition="fade" />,
            children: tabChildren,
          },
          {
            path: 'tabs-slide',
            handle: { transition: 'slide', tabs: true },
            element: (
              <TabsLayout basePath="/push/tabs-slide" transition="slide" tabKeys={['a', 'b', 'c']} />
            ),
            children: tabSlideChildren,
          },
          {
            path: 'tabs-indicator',
            handle: { transition: 'none', tabs: true },
            element: <TabsIndicatorLayout basePath="/push/tabs-indicator" />,
            children: tabSlideChildren,
          },
          {
            path: 'catalog',
            handle: { transition: 'cover', mode: 'stack' },
            element: <CatalogLayout basePath="/push/catalog" />,
            children: [
              { index: true, element: <CatalogList basePath="/push/catalog" /> },
              { path: ':id', element: <CatalogDetail /> },
            ],
          },
        ],
      },

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
            handle: { transition: 'fade', tabs: true },
            element: <TabsLayout basePath="/wrap/tabs" transition="fade" />,
            children: tabChildren,
          },
          {
            path: 'tabs-slide',
            handle: { transition: 'slide', tabs: true },
            element: (
              <TabsLayout basePath="/wrap/tabs-slide" transition="slide" tabKeys={['a', 'b', 'c']} />
            ),
            children: tabSlideChildren,
          },
          {
            path: 'tabs-indicator',
            handle: { transition: 'none', tabs: true },
            element: <TabsIndicatorLayout basePath="/wrap/tabs-indicator" />,
            children: tabSlideChildren,
          },
          {
            path: 'catalog',
            handle: { transition: 'cover', mode: 'stack' },
            element: <CatalogLayout basePath="/wrap/catalog" />,
            children: [
              { index: true, element: <CatalogList basePath="/wrap/catalog" /> },
              { path: ':id', element: <CatalogDetail /> },
            ],
          },
        ],
      },
    ],
  },
]
