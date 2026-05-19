"use client"
import React from 'react';
import { cn } from "@/lib/utils";

const RadioGroup = ({ children, className, value, onChange, name }) => {
    return (
        <div className={cn("flex flex-col gap-2", className)} role="radiogroup">
            {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child, {
                        name,
                        checked: child.props.value === value,
                        onChange: () => onChange(child.props.value),
                    });
                }
                return child;
            })}
        </div>
    );
};

const Radio = ({ id, label, value, checked, onChange, name, className }) => {
    return (
        <label
            htmlFor={id}
            className={cn(
                "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border border-transparent hover:bg-white/10 group",
                checked ? "bg-white/20 border-white/30 shadow-sm" : "bg-transparent",
                className
            )}
        >
            <div className="relative flex items-center justify-center">
                <input
                    type="radio"
                    id={id}
                    name={name}
                    value={value}
                    checked={checked}
                    onChange={onChange}
                    className="sr-only"
                />
                <div className={cn(
                    "w-5 h-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center",
                    checked
                        ? "border-primary-400 bg-primary-400"
                        : "border-white/40 group-hover:border-white/60"
                )}>
                    {checked && <div className="w-2 h-2 bg-white rounded-full shadow-inner" />}
                </div>
            </div>
            <span className={cn(
                "text-sm font-medium transition-colors",
                checked ? "text-black" : "text-black/70"
            )}>
                {label}
            </span>
        </label>
    );
};

export { Radio, RadioGroup };
