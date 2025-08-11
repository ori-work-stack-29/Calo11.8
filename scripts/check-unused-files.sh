#!/bin/bash

# Unused Files Checker Script - Enhanced for React Native/Expo
# This script checks for unused files in server and client directories

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    printf "${1}%s${NC}\n" "$2"
}

# Function to get all possible import patterns for a file
get_import_patterns() {
    local file="$1"
    local search_dir="$2"
    local basename_file=$(basename "$file")
    local filename_no_ext="${basename_file%.*}"
    local relative_path="${file#$search_dir/}"
    local dir_path=$(dirname "$relative_path")
    
    local patterns=()
    
    # Direct filename patterns (with and without extension)
    patterns+=("${filename_no_ext}")
    patterns+=("${basename_file}")
    
    # Relative path patterns
    if [ "$dir_path" != "." ]; then
        patterns+=("${relative_path}")
        patterns+=("${relative_path%.*}")
        patterns+=("./${relative_path}")
        patterns+=("./${relative_path%.*}")
        
        # Path variations
        IFS='/' read -ra PATH_PARTS <<< "$dir_path"
        for i in "${!PATH_PARTS[@]}"; do
            local partial_path=""
            for j in $(seq $i $((${#PATH_PARTS[@]}-1))); do
                if [ -n "$partial_path" ]; then
                    partial_path="${partial_path}/${PATH_PARTS[$j]}"
                else
                    partial_path="${PATH_PARTS[$j]}"
                fi
            done
            patterns+=("${partial_path}/${filename_no_ext}")
            patterns+=("${partial_path}/${basename_file}")
        done
    fi
    
    printf '%s\n' "${patterns[@]}"
}

# Function to check if a file is used/referenced
check_file_usage() {
    local file="$1"
    local search_dir="$2"
    local basename_file=$(basename "$file")
    local filename_no_ext="${basename_file%.*}"
    
    # Skip checking these file types as they're typically entry points or configs
    case "$file" in
        */package.json|*/package-lock.json|*/.env*|*/.*rc*|*/.*ignore|*/README*|*/LICENSE*|*/tsconfig.json|*/webpack.config.*|*/vite.config.*|*/next.config.*|*/tailwind.config.*|*/eslint.config.*|*/.prettierrc*|*/jest.config.*|*/babel.config.*|*/expo-env.d.ts|*/app.json|*/app.config.*|*/metro.config.*|*/global.d.ts)
            return 1 # Consider as used
            ;;
    esac
    
    # Always consider cache files as unused (safe to delete)
    case "$file" in
        */.expo/web/cache/*|*/.expo/packager-info.json)
            return 0 # These can be considered unused
            ;;
    esac
    
    # Skip Expo Router layout files and special files
    case "$file" in
        */app/_layout.tsx|*/app/_layout.js|*/app/+html.tsx|*/app/+not-found.tsx|*/\(tabs\)/_layout.*|*/\(auth\)/_layout.*|*/index.tsx|*/index.js|*/index.ts)
            return 1 # These are special files
            ;;
    esac
    
    # Get all possible import patterns for this file
    local import_patterns
    mapfile -t import_patterns < <(get_import_patterns "$file" "$search_dir")
    
    # Create comprehensive search patterns
    local search_expressions=()
    
    for pattern in "${import_patterns[@]}"; do
        # Import statements (ES6/CommonJS)
        search_expressions+=(
            "import.*['\"\`]${pattern}['\"\`]"
            "import.*['\"\`]\./${pattern}['\"\`]"
            "import.*['\"\`]\.\.\/${pattern}['\"\`]"
            "require\(['\"\`]${pattern}['\"\`]"
            "require\(['\"\`]\./${pattern}['\"\`]"
            "require\(['\"\`]\.\.\/${pattern}['\"\`]"
            "from ['\"\`]${pattern}['\"\`]"
            "from ['\"\`]\./${pattern}['\"\`]"
            "from ['\"\`]\.\.\/${pattern}['\"\`]"
        )
        
        # Dynamic imports
        search_expressions+=(
            "import\(['\"\`]${pattern}['\"\`]"
            "import\(['\"\`]\./${pattern}['\"\`]"
            "import\(['\"\`]\.\.\/${pattern}['\"\`]"
        )
        
        # React Native specific patterns
        search_expressions+=(
            "source.*require\(['\"\`].*${pattern}['\"\`]"
            "uri.*['\"\`].*${pattern}['\"\`]"
        )
        
        # Component usage in JSX
        search_expressions+=(
            "<${filename_no_ext}[[:space:]/>]"
            "<${filename_no_ext}\."
        )
        
        # Router navigation
        search_expressions+=(
            "router\.(push|replace|navigate)\(['\"\`].*${pattern}['\"\`]"
            "href=['\"\`].*${pattern}['\"\`]"
            "Link.*href=['\"\`].*${pattern}['\"\`]"
        )
        
        # File path references
        search_expressions+=(
            "['\"\`]${pattern}['\"\`]"
            "['\"\`]\./${pattern}['\"\`]"
            "['\"\`]\.\.\/${pattern}['\"\`]"
        )
    done
    
    # CSS/SCSS specific patterns
    if [[ "$basename_file" =~ \.(css|scss|sass|less)$ ]]; then
        search_expressions+=(
            "@import.*['\"\`].*${filename_no_ext}['\"\`]"
            "@import.*['\"\`].*${basename_file}['\"\`]"
        )
    fi
    
    # HTML references
    search_expressions+=(
        "src=['\"\`].*${basename_file}['\"\`]"
        "href=['\"\`].*${basename_file}['\"\`]"
        "<link.*${basename_file}"
        "<script.*${basename_file}"
    )
    
    # Check each search expression
    for expr in "${search_expressions[@]}"; do
        if grep -r -l --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.expo --exclude="$basename_file" -E "$expr" "$search_dir" >/dev/null 2>&1; then
            return 1 # File is used
        fi
    done
    
    # Additional check for component names in TypeScript/JavaScript files
    if [[ "$basename_file" =~ \.(tsx|ts|jsx|js)$ ]]; then
        # Look for the component name being used
        if grep -r -l --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.expo --exclude="$basename_file" -E "\b${filename_no_ext}\b" "$search_dir" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" >/dev/null 2>&1; then
            return 1 # File is used
        fi
    fi
    
    return 0 # File appears unused
}

# Function to analyze directory for unused files
analyze_directory() {
    local dir="$1"
    local dir_name="$2"
    
    print_color $BLUE "Analyzing $dir_name directory: $dir"
    
    if [ ! -d "$dir" ]; then
        print_color $RED "Directory $dir does not exist, skipping..."
        return
    fi
    
    local unused_files=()
    local total_files=0
    local unused_size=0
    
    # Find all relevant files (exclude more cache directories)
    while IFS= read -r -d '' file; do
        total_files=$((total_files + 1))
        
        if check_file_usage "$file" "$dir"; then
            unused_files+=("$file")
            if [ -f "$file" ]; then
                local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
                unused_size=$((unused_size + size))
            fi
        fi
    done < <(find "$dir" -type f \( \
        -name "*.js" -o \
        -name "*.jsx" -o \
        -name "*.ts" -o \
        -name "*.tsx" -o \
        -name "*.vue" -o \
        -name "*.css" -o \
        -name "*.scss" -o \
        -name "*.sass" -o \
        -name "*.less" -o \
        -name "*.html" -o \
        -name "*.htm" -o \
        -name "*.json" -o \
        -name "*.png" -o \
        -name "*.jpg" -o \
        -name "*.jpeg" -o \
        -name "*.gif" -o \
        -name "*.svg" -o \
        -name "*.ico" -o \
        -name "*.woff" -o \
        -name "*.woff2" -o \
        -name "*.ttf" -o \
        -name "*.otf" \
        \) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.expo/*" ! -path "*/android/app/build/*" ! -path "*/ios/build/*" -print0)
    
    print_color $YELLOW "Found ${#unused_files[@]} potentially unused files out of $total_files total files"
    
    if [ ${#unused_files[@]} -gt 0 ]; then
        print_color $YELLOW "\nPotentially unused files in $dir_name:"
        
        # Group files by type for better readability
        local cache_files=()
        local component_files=()
        local asset_files=()
        local other_files=()
        
        for file in "${unused_files[@]}"; do
            case "$file" in
                */.expo/*|*/android/app/src/main/res/*)
                    cache_files+=("$file")
                    ;;
                */components/*|*/hooks/*|*/utils/*|*/services/*)
                    component_files+=("$file")
                    ;;
                */assets/*|*.png|*.jpg|*.jpeg|*.gif|*.svg|*.ico|*.woff|*.woff2|*.ttf|*.otf)
                    asset_files+=("$file")
                    ;;
                *)
                    other_files+=("$file")
                    ;;
            esac
        done
        
        if [ ${#cache_files[@]} -gt 0 ]; then
            echo -e "\n${YELLOW}Cache/Build files (safe to delete):${NC}"
            printf '%s\n' "${cache_files[@]}" | sort
        fi
        
        if [ ${#other_files[@]} -gt 0 ]; then
            echo -e "\n${YELLOW}Other files:${NC}"
            printf '%s\n' "${other_files[@]}" | sort
        fi
        
        if [ ${#component_files[@]} -gt 0 ]; then
            echo -e "\n${RED}Components/Hooks/Utils (review carefully):${NC}"
            printf '%s\n' "${component_files[@]}" | sort
        fi
        
        if [ ${#asset_files[@]} -gt 0 ]; then
            echo -e "\n${RED}Assets (review carefully):${NC}"
            printf '%s\n' "${asset_files[@]}" | sort
        fi
        
        # Convert size to human readable
        local size_mb=$((unused_size / 1024 / 1024))
        local size_kb=$((unused_size / 1024))
        
        if [ $size_mb -gt 0 ]; then
            print_color $YELLOW "\nTotal size of unused files: ${size_mb}MB"
        elif [ $size_kb -gt 0 ]; then
            print_color $YELLOW "\nTotal size of unused files: ${size_kb}KB"
        else
            print_color $YELLOW "\nTotal size of unused files: ${unused_size} bytes"
        fi
    else
        print_color $GREEN "No unused files found in $dir_name!"
    fi
    
    echo
}

# Function to create summary report
create_summary() {
    print_color $BLUE "=== UNUSED FILES SUMMARY ==="
    print_color $YELLOW "This enhanced script checks for unused files by looking for:"
    echo "  • ES6 imports (import/from statements)"
    echo "  • CommonJS requires"
    echo "  • Dynamic imports"
    echo "  • React component usage in JSX"
    echo "  • React Native asset requirements"
    echo "  • Expo Router navigation patterns"
    echo "  • File path references"
    echo "  • Component name usage"
    echo
    print_color $YELLOW "Files are grouped by category:"
    echo "  • ${GREEN}Cache/Build files${NC} - Generally safe to delete"
    echo "  • ${RED}Components/Utils${NC} - Review carefully before deletion"
    echo "  • ${RED}Assets${NC} - May be loaded dynamically, review carefully"
    echo
    print_color $RED "Always test your app after deleting any files!"
    echo
}

# Main script execution
main() {
    print_color $GREEN "Starting enhanced unused files analysis..."
    echo
    
    # Check if we're in the right directory structure
    local current_dir=$(pwd)
    local server_dir=""
    local client_dir=""
    
    # Look for server and client directories
    if [ -d "./server" ] && [ -d "./client" ]; then
        server_dir="./server"
        client_dir="./client"
    elif [ -d "../server" ] && [ -d "../client" ]; then
        server_dir="../server"
        client_dir="../client"
    else
        # Try to find them in current directory
        server_dir=$(find . -maxdepth 2 -type d -name "server" | head -1)
        client_dir=$(find . -maxdepth 2 -type d -name "client" | head -1)
        
        if [ -z "$server_dir" ]; then
            server_dir="./server"
        fi
        if [ -z "$client_dir" ]; then
            client_dir="./client"
        fi
    fi
    
    print_color $BLUE "Server directory: $server_dir"
    print_color $BLUE "Client directory: $client_dir"
    echo
    
    # Analyze server directory
    analyze_directory "$server_dir" "SERVER"
    
    # Analyze client directory
    analyze_directory "$client_dir" "CLIENT"
    
    # Create summary
    create_summary
    
    print_color $GREEN "Enhanced analysis complete!"
}

# Run the script
main "$@"