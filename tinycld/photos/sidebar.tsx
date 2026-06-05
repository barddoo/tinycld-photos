import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { router, useGlobalSearchParams, usePathname } from 'expo-router'
import { Grid3X3, Heart, Image, Trash2 } from 'lucide-react-native'
import { useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { ActiveSection } from './types'

interface NavItem {
    section: ActiveSection
    label: string
    icon: typeof Image
    route: string
}

const NAV_ITEMS: NavItem[] = [
    { section: 'timeline', label: 'Timeline', icon: Image, route: 'photos' },
    { section: 'albums', label: 'Albums', icon: Grid3X3, route: 'photos/albums' },
    { section: 'favorites', label: 'Favorites', icon: Heart, route: 'photos?section=favorites' },
    { section: 'trash', label: 'Trash', icon: Trash2, route: 'photos?section=trash' },
]

export default function PhotosSidebar() {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const activeBg = useThemeColor('active-indicator')
    const pathname = usePathname()
    const params = useGlobalSearchParams<{ section?: string }>()
    const orgHref = useOrgHref()
    const isMobile = useBreakpoint() === 'mobile'

    const currentSection = params.section
        ? (params.section as ActiveSection)
        : getSectionFromPath(pathname)

    const handleNav = useCallback(
        (item: NavItem) => {
            router.push(orgHref(item.route))
        },
        [orgHref]
    )

    return (
        <View className="p-3 gap-1">
            <Text
                style={{ color: muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, paddingHorizontal: 12, paddingVertical: 8 }}
                className="uppercase"
            >
                Photos
            </Text>
            {NAV_ITEMS.map(item => {
                const Icon = item.icon
                const isActive = currentSection === item.section
                return (
                    <Pressable
                        key={item.section}
                        onPress={() => handleNav(item)}
                        className="flex-row items-center gap-3 px-3 py-2 rounded-lg"
                        style={isActive ? { backgroundColor: `${activeBg}15` } : undefined}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                        accessibilityState={{ selected: isActive }}
                    >
                        <Icon
                            size={18}
                            color={isActive ? activeBg : muted}
                        />
                        <Text
                            style={{
                                color: isActive ? activeBg : fg,
                                fontSize: 14,
                                fontWeight: isActive ? '500' : '400',
                            }}
                        >
                            {item.label}
                        </Text>
                    </Pressable>
                )
            })}
        </View>
    )
}

function getSectionFromPath(pathname: string): ActiveSection {
    if (pathname.includes('/albums/') || pathname.endsWith('/albums')) return 'albums'
    return 'timeline'
}
