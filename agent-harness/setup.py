from setuptools import find_namespace_packages, setup


setup(
    name="cli-anything-wui-homepage",
    version="1.0.0",
    description="Structured CLI editor for the wui.me Jekyll academic homepage",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    install_requires=[
        "click>=8.0.0",
        "prompt-toolkit>=3.0.0",
        "ruamel.yaml>=0.18.0",
    ],
    entry_points={
        "console_scripts": [
            "cli-anything-wui-homepage=cli_anything.wui_homepage.wui_homepage_cli:main",
        ],
    },
    package_data={
        "cli_anything.wui_homepage": ["skills/*.md"],
    },
    python_requires=">=3.10",
)
