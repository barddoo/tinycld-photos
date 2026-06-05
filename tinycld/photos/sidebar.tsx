import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { router, useGlobalSearchParams, usePathname } from 'expo-router'
import { Clock, Grid3X3, Heart, Image, Map, Search, Tags, Trash2, Users } from 'lucide-react-native'
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
    { section: 'search', label: 'Search', icon: Search, route: 'photos/search' },
    { section: 'albums', label: 'Albums', icon: Grid3X3, route: 'photos/albums' },
    { section: 'favorites', label: 'Favorites', icon: Heart, route: 'photos?section=favorites' },
]

const NAV_DISCOVER: NavItem[] = [
    { section: 'people', label: 'People', icon: Users, route: 'photos/people' },
    { section: 'memories', label: 'Memories', icon: Clock, route: 'photos/memories' },
    { section: 'map', label: 'Map', icon: Map, route: 'photos/map' },
]

const NAV_EXTRA: NavItem[] = [
    { section: 'tags', label: 'Tags', icon: Tags, route: 'photos/tags' },
    { section: 'trash', label: 'Trash', icon: Trash2, route: 'photos?section=trash' },
]

const DIVIDER = { height: 1, backgroundColor: 'rgba(128,128,128,0.15)', marginHorizontal: 12, marginVertical: 8 }

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

    const renderItem = (item: NavItem) => {
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
    }

    return (
        <View className="p-3 gap-1">
            <Text
                style={{ color: muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, paddingHorizontal: 12, paddingVertical: 8 }}
                className="uppercase"
            >
                Photos
            </Text>
            {NAV_ITEMS.map(renderItem)}
            <View style={DIVIDER} />
            {NAV_DISCOVER.map(renderItem)}
            <View style={DIVIDER} />
            {NAV_EXTRA.map(renderItem)}
        </View>
    )
}

function getSectionFromPath(pathname: string): ActiveSection {
    if (pathname.includes('/albums/') || pathname.endsWith('/albums')) return 'albums'
    if (pathname.includes('/tags') || pathname.endsWith('/tags')) return 'tags'
    if (pathname.includes('/search') || pathname.endsWith('/search')) return 'search'
    if (pathname.includes('/people') || pathname.endsWith('/people')) return 'people'
    if (pathname.includes('/memories') || pathname.endsWith('/memories')) return 'memories'
    if (pathname.includes('/map') || pathname.endsWith('/map')) return 'map'
    return 'timeline'
}
